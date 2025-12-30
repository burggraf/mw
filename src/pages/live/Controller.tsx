import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChurch } from '@/contexts/ChurchContext'
import { getEventItems } from '@/services/events'
import { getSong } from '@/services/songs'
import { getMediaById, getSignedMediaUrl } from '@/services/media'
import { generateSlides } from '@/lib/slide-generator'
import { emit } from '@tauri-apps/api/event'
import { useNats, type LyricsMessage } from '@/hooks/useNats'
import type { Slide } from '@/types/live'
import type { Song } from '@/types/song'
import type { Event, EventItemWithData } from '@/types/event'
import { SlidePreview, SetlistPicker, SlideNavigator, ControlButtons } from '@/components/live'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'

interface ControllerState {
  currentEventId: string | null
  currentSong: Song | null
  currentSongId: string | null  // Actual song ID, not event item ID
  currentItemId: string | null  // Event item ID
  currentSlideIndex: number
  slides: Slide[]
  setlist: EventItemWithData[]
}

export function Controller() {
  const { t } = useTranslation()
  const { currentChurch } = useChurch()
  const { isConnected: natsConnected, publishLyrics, publishSlide } = useNats()

  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [prefetching, setPrefetching] = useState(false)
  const [currentBackgroundUrl, setCurrentBackgroundUrl] = useState<string | null>(null)
  const [state, setState] = useState<ControllerState>({
    currentEventId: null,
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

        // Auto-select first event
        if (data && data.length > 0 && !state.currentEventId) {
          await selectEvent(data[0].id)
        }
      } catch (error) {
        console.error('Failed to load events:', error)
      } finally {
        setLoading(false)
      }
    }

    loadEvents()
  }, [currentChurch?.id])

  // TODO: Initialize NATS client on mount
  useEffect(() => {
    if (!currentChurch?.id) return

    async function initNats() {
      console.log('[Controller] NATS initialization TODO')
      // await invoke('spawn_nats_server')
      // await invoke('discover_nats_cluster')
    }

    initNats()
  }, [currentChurch?.id])

  // Send song data to all connected displays via Tauri events (local displays)
  const sendSongData = async (song: Song & { updated_at: string }) => {
    // Fetch background images as base64 data URLs
    const backgroundDataUrls: Record<string, string> = {}
    const backgrounds = song.backgrounds || {}

    for (const [key, mediaId] of Object.entries(backgrounds)) {
      if (mediaId) {
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
            backgroundDataUrls[key] = dataUrl
            console.log('[Controller] Fetched background as data URL:', key)
          }
        } catch (error) {
          console.error('[Controller] Failed to get background', mediaId, ':', error)
        }
      }
    }

    const message = {
      songData: { song, backgroundDataUrls },
    }

    console.log('[Controller] Sending song data:', song.title)

    // Emit Tauri event for local displays
    try {
      await emit('display:slide', message)
      console.log('[Controller] Sent song data via Tauri event for local displays')
    } catch (error) {
      console.error('[Controller] Failed to emit Tauri event:', error)
    }

    // Send via NATS to remote displays
    if (natsConnected && currentChurch?.id && state.currentEventId) {
      try {
        // Get default background URL for remote displays
        const bgMediaId = song.backgrounds?.default
        let backgroundUrl: string | undefined
        if (bgMediaId) {
          try {
            const media = await getMediaById(bgMediaId)
            if (media?.storagePath) {
              backgroundUrl = await getSignedMediaUrl(media.storagePath, 3600)
            }
          } catch (e) {
            console.error('[Controller] Failed to get background URL for NATS:', e)
          }
        }

        const lyricsMessage: LyricsMessage = {
          church_id: currentChurch.id,
          event_id: state.currentEventId,
          song_id: song.id,
          title: song.title,
          lyrics: song.content || '',
          background_url: backgroundUrl,
          timestamp: Date.now(),
        }

        await publishLyrics(lyricsMessage)
        console.log('[Controller] Sent song data via NATS for remote displays')
      } catch (error) {
        console.error('[Controller] Failed to publish via NATS:', error)
      }
    }
  }

  // Pre-fetch all songs for the event and send to displays
  const prefetchSongs = async (setlist: EventItemWithData[]) => {
    const songItems = setlist.filter(item => item.itemType === 'song')
    if (songItems.length === 0) return

    setPrefetching(true)
    console.log('[Controller] Pre-fetching', songItems.length, 'songs for displays')

    for (const item of songItems) {
      try {
        const song = await getSong(item.itemId)
        if (song) {
          console.log('[Controller] Pre-fetching song:', song.title)
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
    console.log('[Controller] Pre-fetch complete')
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

      // Pre-fetch all songs for displays
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
    if (!state.currentEventId) {
      console.warn('[Controller] Cannot send slide: no currentEventId')
      return
    }

    console.log('[Controller] Sending slide update:', { songId, slideIndex })

    // Emit Tauri event for local displays
    try {
      const song = state.currentSong
      if (song) {
        // Fetch background images as base64 data URLs
        const backgroundDataUrls: Record<string, string> = {}
        const backgrounds = song.backgrounds || {}

        for (const [key, mediaId] of Object.entries(backgrounds)) {
          if (mediaId) {
            try {
              const media = await getMediaById(mediaId)
              if (media?.storagePath || media?.thumbnailPath) {
                const signedUrl = await getSignedMediaUrl(media.thumbnailPath || media.storagePath!, 3600)
                const response = await fetch(signedUrl)
                const blob = await response.blob()
                const reader = new FileReader()
                const dataUrl = await new Promise<string>((resolve) => {
                  reader.onloadend = () => resolve(reader.result as string)
                  reader.readAsDataURL(blob)
                })
                backgroundDataUrls[key] = dataUrl
              }
            } catch (error) {
              console.error('[Controller] Failed to get background data URL for', mediaId, ':', error)
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

    // Send via NATS to remote displays
    if (natsConnected && currentChurch?.id && state.currentEventId) {
      try {
        await publishSlide({
          church_id: currentChurch.id,
          event_id: state.currentEventId,
          song_id: songId,
          slide_index: slideIndex,
          timestamp: Date.now(),
        })
        console.log('[Controller] Sent slide update via NATS for remote displays')
      } catch (error) {
        console.error('[Controller] Failed to publish slide via NATS:', error)
      }
    }
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
  }, [state.currentSlideIndex, state.slides.length, state.currentSongId])

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
          {prefetching ? (
            <Badge variant="outline" className="gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Syncing...
            </Badge>
          ) : null}
          <Badge variant="outline" className={`gap-1 ${natsConnected ? 'text-green-600' : 'text-muted-foreground'}`}>
            {natsConnected ? 'NATS Connected' : 'NATS Disconnected (Local Only)'}
          </Badge>
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
