import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChurch } from '@/contexts/ChurchContext'
import { getEventItems } from '@/services/events'
import { getSong } from '@/services/songs'
import { getMediaById, getSignedMediaUrl } from '@/services/media'
import { generateSlides } from '@/lib/slide-generator'
import { emit } from '@tauri-apps/api/event'
import { useWebSocket, type LyricsMessage, type SlideMessage } from '@/hooks/useWebSocket'
import type { Slide } from '@/types/live'
import type { Song } from '@/types/song'
import type { Event, EventItemWithData } from '@/types/event'
import { SlidePreview, SetlistPicker, SlideNavigator, ControlButtons } from '@/components/live'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Wifi, WifiOff, RefreshCw } from 'lucide-react'

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

  // WebSocket hook for remote displays
  const {
    devices,
    connections,
    discoverDevices,
    connectToDevice,
    disconnectFromDevice,
    broadcastLyrics,
    broadcastSlide,
  } = useWebSocket()

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

  // Send song data to all connected displays via Tauri events (local displays) and WebSocket (remote displays)
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

    // Broadcast to remote displays via WebSocket
    const lyricsMessage: LyricsMessage = {
      church_id: currentChurch?.id || '',
      event_id: state.currentEventId || '',
      song_id: song.id,
      title: song.title,
      lyrics: song.content,
      background_url: undefined, // Backgrounds are sent separately in Tauri events
      timestamp: Date.now(),
    }
    broadcastLyrics(lyricsMessage)
    console.log('[Controller] Broadcast song data to', connections.size, 'WebSocket connections')
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

    // Broadcast slide update to remote displays via WebSocket
    const slideMessage: SlideMessage = {
      church_id: currentChurch?.id || '',
      event_id: state.currentEventId || '',
      song_id: songId,
      slide_index: slideIndex,
      timestamp: Date.now(),
    }
    broadcastSlide(slideMessage)
    console.log('[Controller] Broadcast slide update to', connections.size, 'WebSocket connections')
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
          {/* WebSocket connection status */}
          {connections.size > 0 ? (
            <Badge variant="outline" className="gap-1">
              <Wifi className="w-3 h-3" />
              {connections.size} {connections.size === 1 ? 'display' : 'displays'}
            </Badge>
          ) : null}
          {prefetching ? (
            <Badge variant="outline" className="gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Syncing...
            </Badge>
          ) : null}
        </div>

        {/* Device discovery */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => discoverDevices()}
            disabled={devices.length === 0}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Discover ({devices.length})
          </Button>
          {devices.map((device) => {
            const key = `${device.host}:${device.port}`
            const isConnected = connections.has(key)
            return (
              <Button
                key={key}
                variant={isConnected ? 'default' : 'outline'}
                size="sm"
                onClick={() => isConnected ? disconnectFromDevice(device) : connectToDevice(device)}
              >
                {isConnected ? (
                  <>
                    <Wifi className="w-4 h-4 mr-2" />
                    {device.name.split('.')[0]}
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4 mr-2" />
                    {device.name.split('.')[0]}
                  </>
                )}
              </Button>
            )
          })}
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
