import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { useChurch } from '@/contexts/ChurchContext'
import { useWebSocketConnections } from '@/contexts/WebSocketContext'
import { getEventItems } from '@/services/events'
import { getSong } from '@/services/songs'
import { getMediaById, getSignedMediaUrl } from '@/services/media'
import { generateSlides } from '@/lib/slide-generator'
import { emit } from '@tauri-apps/api/event'
import type { Slide } from '@/types/live'
import type { Song } from '@/types/song'
import type { Event, EventItemWithData } from '@/types/event'
import { SlidePreview, SetlistPicker, SlideNavigator, ControlButtons } from '@/components/live'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'

// Cache for background data URLs to avoid re-fetching
const backgroundDataUrlCache = new Map<string, string>()

interface ControllerState {
  currentEventId: string | null
  currentSong: Song | null
  currentSongId: string | null
  currentItemId: string | null
  currentSlideIndex: number
  slides: Slide[]
  setlist: EventItemWithData[]
}

export function Controller() {
  const { t } = useTranslation()
  const location = useLocation()
  const { currentChurch } = useChurch()
  const { connected, broadcastLyrics, broadcastSlide } = useWebSocketConnections()

  // Get initial event ID from navigation state (set by EventCard Start button)
  const initialEventId = (location.state as { eventId?: string } | null)?.eventId

  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [prefetching, setPrefetching] = useState(false)
  const [currentBackgroundUrl, setCurrentBackgroundUrl] = useState<string | null>(null)
  const [state, setState] = useState<ControllerState>({
    currentEventId: initialEventId || null,
    currentSong: null,
    currentSongId: null,
    currentItemId: null,
    currentSlideIndex: 0,
    slides: [],
    setlist: [],
  })

  // Load events on mount
  useEffect(() => {
    if (!currentChurch?.id) return

    async function loadEvents() {
      try {
        const { getSupabase } = await import('@/lib/supabase')
        const supabase = getSupabase()

        const { data, error } = await supabase
          .from('events')
          .select('*')
          .eq('church_id', currentChurch!.id)
          .gte('scheduled_at', new Date().toISOString())
          .order('scheduled_at', { ascending: true })
          .limit(10)

        if (error) throw error
        setEvents(data || [])

        // If we have an initial event from navigation state, use it
        // Otherwise, select the first event if we don't have one
        if (initialEventId) {
          await selectEvent(initialEventId)
        } else if (data && data.length > 0 && !state.currentEventId) {
          await selectEvent(data[0].id)
        }
      } catch (error) {
        console.error('Failed to load events:', error)
      } finally {
        setLoading(false)
      }
    }

    loadEvents()
  }, [currentChurch?.id, initialEventId])

  // Helper to get or fetch background data URL (with caching)
  const getBackgroundDataUrl = async (mediaId: string): Promise<string | null> => {
    // Check cache first
    const cached = backgroundDataUrlCache.get(mediaId)
    if (cached) return cached

    try {
      const media = await getMediaById(mediaId)
      if (media?.storagePath) {
        const signedUrl = await getSignedMediaUrl(media.storagePath, 3600)
        const response = await fetch(signedUrl)
        const blob = await response.blob()
        const reader = new FileReader()
        const dataUrl = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string)
          reader.readAsDataURL(blob)
        })
        // Cache for future use
        backgroundDataUrlCache.set(mediaId, dataUrl)
        return dataUrl
      }
    } catch (error) {
      console.error('[Controller] Failed to get background', mediaId, ':', error)
    }
    return null
  }

  // Send song data to all connected displays
  const sendSongData = async (song: Song & { updated_at: string }) => {
    // Fetch background images as base64 data URLs (with caching)
    const backgroundDataUrls: Record<string, string> = {}
    const backgrounds = song.backgrounds || {}

    // Fetch all backgrounds in parallel
    await Promise.all(
      Object.entries(backgrounds).map(async ([key, mediaId]) => {
        if (mediaId) {
          const dataUrl = await getBackgroundDataUrl(mediaId)
          if (dataUrl) {
            backgroundDataUrls[key] = dataUrl
          }
        }
      })
    )

    // Emit Tauri event for local displays
    try {
      await emit('display:slide', {
        songData: { song, backgroundDataUrls },
      })
      console.log('[Controller] Sent song data via Tauri event for local displays')
    } catch (error) {
      console.error('[Controller] Failed to emit Tauri event:', error)
    }

    // Broadcast to remote displays via WebSocket
    // Note: Remote displays should already have media cached from precache message
    broadcastLyrics({
      church_id: currentChurch?.id || '',
      event_id: state.currentEventId || '',
      song_id: song.id,
      title: song.title,
      lyrics: song.content,
      timestamp: Date.now(),
    })
    console.log('[Controller] Broadcast song data to', connected.size, 'WebSocket connections')
  }

  // Pre-fetch all songs for the event
  const prefetchSongs = async (setlist: EventItemWithData[]) => {
    const songItems = setlist.filter(item => item.itemType === 'song')
    if (songItems.length === 0) return

    setPrefetching(true)
    for (const item of songItems) {
      try {
        const song = await getSong(item.itemId)
        if (song) {
          await sendSongData({
            ...song,
            updated_at: song.updatedAt,
          } as Song & { updated_at: string })
        }
      } catch (error) {
        console.error('[Controller] Failed to prefetch song:', item.itemId, error)
      }
    }

    setPrefetching(false)
  }

  // Select event and load setlist
  const selectEvent = useCallback(async (eventId: string) => {
    try {
      const items = await getEventItems(eventId)
      setState(prev => ({
        ...prev,
        currentEventId: eventId,
        setlist: items,
        currentSong: null,
        currentSongId: null,
        currentItemId: null,
        currentSlideIndex: 0,
        slides: [],
      }))
      await prefetchSongs(items)
    } catch (error) {
      console.error('Failed to load event items:', error)
    }
  }, [])

  // Select song from setlist and generate slides
  const selectSong = async (itemId: string) => {
    try {
      const item = state.setlist.find(i => i.id === itemId)
      if (!item || item.itemType !== 'song') return

      const song = await getSong(item.itemId)
      if (!song) return

      const slides = generateSlides(song, item.customizations)

      setState(prev => ({
        ...prev,
        currentSong: song,
        currentSongId: song.id,
        currentItemId: itemId,
        currentSlideIndex: 0,
        slides,
      }))

      // Fetch background URL for preview
      const bgId = song.backgrounds?.default
      if (bgId) {
        try {
          const media = await getMediaById(bgId)
          if (media && media.backgroundColor) {
            setCurrentBackgroundUrl(null)
          } else if (media && (media.storagePath || media.thumbnailPath)) {
            const url = await getSignedMediaUrl(media.thumbnailPath || media.storagePath!)
            setCurrentBackgroundUrl(url)
          } else {
            setCurrentBackgroundUrl(null)
          }
        } catch (e) {
          console.error('[Controller] Failed to load background:', e)
          setCurrentBackgroundUrl(null)
        }
      } else {
        setCurrentBackgroundUrl(null)
      }

      // Send song data to displays
      await sendSongData({
        ...song,
        updated_at: song.updatedAt,
      } as Song & { updated_at: string })

      // Send first slide to displays
      await sendSlideUpdate(song.id, 0)
    } catch (error) {
      console.error('Failed to select song:', error)
    }
  }

  // Send slide update to all connected displays
  const sendSlideUpdate = async (songId: string, slideIndex: number) => {
    console.log('[Controller] Sending slide update:', { songId, slideIndex })

    // Emit Tauri event for local displays
    try {
      const song = state.currentSong
      if (song) {
        // Get cached background data URLs (should already be cached from sendSongData)
        const backgroundDataUrls: Record<string, string> = {}
        const backgrounds = song.backgrounds || {}

        // Use cached URLs - much faster than re-fetching
        for (const [key, mediaId] of Object.entries(backgrounds)) {
          if (mediaId) {
            const cached = backgroundDataUrlCache.get(mediaId)
            if (cached) {
              backgroundDataUrls[key] = cached
            } else {
              // Fallback: fetch if not cached (shouldn't happen normally)
              const dataUrl = await getBackgroundDataUrl(mediaId)
              if (dataUrl) {
                backgroundDataUrls[key] = dataUrl
              }
            }
          }
        }

        await emit('display:slide', {
          songData: {
            song: {
              ...song,
              updated_at: song.updatedAt,
            },
            backgroundDataUrls,
          },
          itemId: songId,
          slideIndex,
        })
        console.log('[Controller] Sent slide update via Tauri event for local displays')
      }
    } catch (error) {
      console.error('[Controller] Failed to emit Tauri event for slide:', error)
    }

    // Broadcast slide update to remote displays via WebSocket
    // Note: Remote displays already have media cached from precache message
    broadcastSlide({
      church_id: currentChurch?.id || '',
      event_id: state.currentEventId || '',
      song_id: songId,
      slide_index: slideIndex,
      timestamp: Date.now(),
    })
    console.log('[Controller] Broadcast slide update to', connected.size, 'WebSocket connections')
  }

  // Navigate to specific slide
  const goToSlide = async (index: number) => {
    if (!state.currentSongId || index < 0 || index >= state.slides.length) return

    setState(prev => ({ ...prev, currentSlideIndex: index }))
    await sendSlideUpdate(state.currentSongId, index)
  }

  // Navigate to next/previous slide
  const goToNext = useCallback(async () => {
    const nextIndex = state.currentSlideIndex + 1
    if (nextIndex < state.slides.length) {
      await goToSlide(nextIndex)
    }
  }, [state.currentSlideIndex, state.slides.length])

  const goToPrevious = useCallback(async () => {
    const prevIndex = state.currentSlideIndex - 1
    if (prevIndex >= 0) {
      await goToSlide(prevIndex)
    }
  }, [state.currentSlideIndex])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goToPrevious()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goToNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [state.currentSlideIndex, state.slides.length, state.currentSongId, goToPrevious, goToNext])

  // Get current slide
  const currentSlide = state.slides[state.currentSlideIndex] || null

  // Extract songs from setlist
  const songsInSetlist = state.setlist
    .filter(item => item.itemType === 'song' && item.song)
    .map(item => item.song!)
    .filter(Boolean)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        {/* Event selector */}
        <div className="flex-1 max-w-md">
          <Select
            value={state.currentEventId || ''}
            onValueChange={selectEvent}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('events.selectEvent')} />
            </SelectTrigger>
            <SelectContent>
              {events.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Connection status */}
        <div className="flex items-center gap-2">
          {connected.size > 0 && (
            <Badge variant="outline" className="gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              {connected.size} {connected.size === 1 ? 'display' : 'displays'}
            </Badge>
          )}
          {prefetching && (
            <Badge variant="outline" className="gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Syncing...
            </Badge>
          )}
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column: Slide preview + controls */}
        <div className="lg:col-span-2 space-y-4">
          {/* Slide preview */}
          <Card>
            <CardHeader>
              <CardTitle>{t('live.preview')}</CardTitle>
            </CardHeader>
            <CardContent>
              <SlidePreview slide={currentSlide} backgroundUrl={currentBackgroundUrl} />
            </CardContent>
          </Card>

          {/* Control buttons */}
          <Card>
            <CardContent className="pt-6">
              <ControlButtons
                currentIndex={state.currentSlideIndex}
                totalSlides={state.slides.length}
                onPrevious={goToPrevious}
                onNext={goToNext}
              />
            </CardContent>
          </Card>

          {/* Slide navigator */}
          <Card>
            <CardHeader>
              <CardTitle>{t('live.sections')}</CardTitle>
            </CardHeader>
            <CardContent>
              <SlideNavigator
                song={state.currentSong}
                currentIndex={state.currentSlideIndex}
                onSelectSlide={goToSlide}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right column: Setlist */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('events.items')}</CardTitle>
            </CardHeader>
            <CardContent>
              <SetlistPicker
                songs={songsInSetlist}
                currentSongId={state.currentSong?.id || null}
                onSelectSong={(songId) => {
                  const item = state.setlist.find(i => i.itemType === 'song' && i.itemId === songId)
                  if (item) selectSong(item.id)
                }}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
