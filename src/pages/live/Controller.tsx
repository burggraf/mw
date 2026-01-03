import { useCallback, useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { useChurch } from '@/contexts/ChurchContext'
import { useWebSocketConnections } from '@/contexts/WebSocketContext'
import { getEventItems } from '@/services/events'
import { getSong } from '@/services/songs'
import { getMediaById, getSignedMediaUrl } from '@/services/media'
import { generateSlides } from '@/lib/slide-generator'
import { isTauri } from '@/lib/tauri'
import type { Slide } from '@/types/live'
import type { Song } from '@/types/song'
import type { Media, SlideFolder } from '@/types/media'
import type { Event, EventItemWithData } from '@/types/event'
import { SlidePreview, SetlistPicker, SlideNavigator, ControlButtons } from '@/components/live'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Loader2, ArrowLeft, Play, Pause, Clock } from 'lucide-react'

// Cache for background/media data URLs to avoid re-fetching
const mediaDataUrlCache = new Map<string, string>()

type DisplayMode = 'song' | 'slide' | 'folder' | null

interface ControllerState {
  currentEventId: string | null
  currentItemId: string | null
  displayMode: DisplayMode
  // Song state
  currentSong: Song | null
  currentSongId: string | null
  slides: Slide[]
  currentSlideIndex: number
  // Slide state
  currentSlide: Media | null
  // Folder state
  currentFolder: (SlideFolder & { slides: Media[] }) | null
  folderSlideIndex: number
  setlist: EventItemWithData[]
}

export function Controller() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { currentChurch } = useChurch()
  const { connected, broadcastLyrics, broadcastSlide, broadcastMedia } = useWebSocketConnections()

  // Get initial event ID from navigation state (set by EventCard Start button)
  const initialEventId = (location.state as { eventId?: string } | null)?.eventId

  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [prefetching, setPrefetching] = useState(false)
  const [currentBackgroundUrl, setCurrentBackgroundUrl] = useState<string | null>(null)

  // Auto-loop state for folders
  const [loopActive, setLoopActive] = useState(false)
  const [loopProgress, setLoopProgress] = useState(0)
  const [currentLoopTime, setCurrentLoopTime] = useState(0) // Effective loop time for current slide
  const loopIntervalRef = useRef<number | null>(null)
  const loopStartTimeRef = useRef<number>(0)

  // Refs for loop closure (to avoid stale state in setInterval)
  const folderRef = useRef<(SlideFolder & { slides: Media[] }) | null>(null)
  const folderSlideIndexRef = useRef<number>(0)

  // Helper to get effective loop time for a slide
  // Returns: null=use folder default, 0=stop loop, >0=use this value
  const getEffectiveLoopTime = (slide: Media, folder: SlideFolder): number => {
    if (slide.loopTime === null || slide.loopTime === undefined) {
      // Use folder default
      return folder.defaultLoopTime
    }
    // Use slide-specific value (0 = stop, >0 = custom time)
    return slide.loopTime
  }

  // Signed URLs for folder slide thumbnails
  const [folderSlideUrls, setFolderSlideUrls] = useState<Map<string, string>>(new Map())

  const [state, setState] = useState<ControllerState>({
    currentEventId: initialEventId || null,
    currentItemId: null,
    displayMode: null,
    currentSong: null,
    currentSongId: null,
    slides: [],
    currentSlideIndex: 0,
    currentSlide: null,
    currentFolder: null,
    folderSlideIndex: 0,
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

  // Cleanup loop interval on unmount
  useEffect(() => {
    return () => {
      if (loopIntervalRef.current) {
        clearInterval(loopIntervalRef.current)
      }
    }
  }, [])

  // Helper to get or fetch media data URL (with caching)
  const getMediaDataUrl = async (storagePath: string): Promise<string | null> => {
    // Check cache first
    const cached = mediaDataUrlCache.get(storagePath)
    if (cached) return cached

    try {
      const signedUrl = await getSignedMediaUrl(storagePath, 3600)
      const response = await fetch(signedUrl)
      const blob = await response.blob()
      const reader = new FileReader()
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(blob)
      })
      // Cache for future use
      mediaDataUrlCache.set(storagePath, dataUrl)
      return dataUrl
    } catch (error) {
      console.error('[Controller] Failed to get media data URL:', error)
    }
    return null
  }

  // Helper to get background data URL (with caching)
  const getBackgroundDataUrl = async (mediaId: string): Promise<string | null> => {
    // Check cache first (use mediaId as key since we're fetching by ID)
    const cacheKey = `bg:${mediaId}`
    const cached = mediaDataUrlCache.get(cacheKey)
    if (cached) return cached

    try {
      const media = await getMediaById(mediaId)
      if (media?.storagePath) {
        const dataUrl = await getMediaDataUrl(media.storagePath)
        if (dataUrl) {
          mediaDataUrlCache.set(cacheKey, dataUrl)
          return dataUrl
        }
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

    // Emit Tauri event for local displays (only in Tauri)
    if (isTauri()) {
      try {
        const { emit } = await import('@tauri-apps/api/event')
        await emit('display:slide', {
          songData: { song, backgroundDataUrls },
        })
        console.log('[Controller] Sent song data via Tauri event for local displays')
      } catch (error) {
        console.error('[Controller] Failed to emit Tauri event:', error)
      }
    }

    // Broadcast to remote displays via WebSocket
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

  // Send media (slide) to displays
  const sendMediaToDisplays = async (media: Media) => {
    const dataUrl = await getMediaDataUrl(media.storagePath)
    if (!dataUrl) return

    // Emit Tauri event for local displays
    if (isTauri()) {
      try {
        const { emit } = await import('@tauri-apps/api/event')
        await emit('display:media', {
          mediaUrl: dataUrl,
          mediaType: media.type,
        })
        console.log('[Controller] Sent media via Tauri event for local displays')
      } catch (error) {
        console.error('[Controller] Failed to emit Tauri event:', error)
      }
    }

    // Broadcast to remote displays via WebSocket
    if (broadcastMedia) {
      broadcastMedia({
        church_id: currentChurch?.id || '',
        event_id: state.currentEventId || '',
        media_url: dataUrl,
        media_type: media.type,
        timestamp: Date.now(),
      })
    }
    console.log('[Controller] Broadcast media to', connected.size, 'WebSocket connections')
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
    // Stop any active loop
    stopLoop()

    try {
      const items = await getEventItems(eventId)
      setState(prev => ({
        ...prev,
        currentEventId: eventId,
        setlist: items,
        currentItemId: null,
        displayMode: null,
        currentSong: null,
        currentSongId: null,
        currentSlideIndex: 0,
        slides: [],
        currentSlide: null,
        currentFolder: null,
        folderSlideIndex: 0,
      }))
      await prefetchSongs(items)
    } catch (error) {
      console.error('Failed to load event items:', error)
    }
  }, [])

  // Select song from setlist and generate slides
  const selectSong = async (itemId: string) => {
    stopLoop()

    try {
      const item = state.setlist.find(i => i.id === itemId)
      if (!item || item.itemType !== 'song') return

      const song = await getSong(item.itemId)
      if (!song) return

      const slides = generateSlides(song, item.customizations)

      setState(prev => ({
        ...prev,
        displayMode: 'song',
        currentSong: song,
        currentSongId: song.id,
        currentItemId: itemId,
        currentSlideIndex: 0,
        slides,
        currentSlide: null,
        currentFolder: null,
        folderSlideIndex: 0,
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

  // Select individual slide
  const selectSlide = async (itemId: string) => {
    stopLoop()

    try {
      const item = state.setlist.find(i => i.id === itemId)
      if (!item || item.itemType !== 'slide' || !item.slide) return

      setState(prev => ({
        ...prev,
        displayMode: 'slide',
        currentItemId: itemId,
        currentSlide: item.slide!,
        currentSong: null,
        currentSongId: null,
        slides: [],
        currentSlideIndex: 0,
        currentFolder: null,
        folderSlideIndex: 0,
      }))

      // Set background preview
      const url = await getSignedMediaUrl(item.slide.storagePath)
      setCurrentBackgroundUrl(url)

      // Send to displays
      await sendMediaToDisplays(item.slide)
    } catch (error) {
      console.error('Failed to select slide:', error)
    }
  }

  // Select folder
  const selectFolder = async (itemId: string) => {
    stopLoop()

    try {
      const item = state.setlist.find(i => i.id === itemId)
      if (!item || item.itemType !== 'slideFolder' || !item.slideFolder) return

      const folder = item.slideFolder
      if (folder.slides.length === 0) return

      // Update refs for loop closure
      folderRef.current = folder
      folderSlideIndexRef.current = 0

      setState(prev => ({
        ...prev,
        displayMode: 'folder',
        currentItemId: itemId,
        currentFolder: folder,
        folderSlideIndex: 0,
        currentSong: null,
        currentSongId: null,
        slides: [],
        currentSlideIndex: 0,
        currentSlide: null,
      }))

      // Load signed URLs for all folder slides (for thumbnails)
      const urlMap = new Map<string, string>()
      await Promise.all(
        folder.slides.map(async (slide) => {
          const url = await getSignedMediaUrl(slide.thumbnailPath || slide.storagePath)
          urlMap.set(slide.id, url)
        })
      )
      setFolderSlideUrls(urlMap)

      // Set background preview for first slide
      const firstSlide = folder.slides[0]
      const url = urlMap.get(firstSlide.id) || await getSignedMediaUrl(firstSlide.storagePath)
      setCurrentBackgroundUrl(url)

      // Send first slide to displays
      await sendMediaToDisplays(firstSlide)

      // Calculate effective loop time for first slide
      const effectiveTime = getEffectiveLoopTime(firstSlide, folder)
      setCurrentLoopTime(effectiveTime)

      // Start auto-loop if configured (folder has default > 0 or first slide has custom time > 0)
      if (effectiveTime > 0) {
        startLoop(effectiveTime)
      }
    } catch (error) {
      console.error('Failed to select folder:', error)
    }
  }

  // Select any item from setlist
  const selectItem = (itemId: string) => {
    const item = state.setlist.find(i => i.id === itemId)
    if (!item) return

    switch (item.itemType) {
      case 'song':
        selectSong(itemId)
        break
      case 'slide':
        selectSlide(itemId)
        break
      case 'slideFolder':
        selectFolder(itemId)
        break
    }
  }

  // Start auto-loop for folder with given interval
  const startLoop = (intervalSeconds: number) => {
    // Don't start if interval is 0 (means stop)
    if (intervalSeconds <= 0) {
      stopLoop()
      return
    }

    setLoopActive(true)
    setLoopProgress(0)
    setCurrentLoopTime(intervalSeconds)
    loopStartTimeRef.current = Date.now()

    const intervalMs = intervalSeconds * 1000
    const updateInterval = 100 // Update progress every 100ms

    // Clear any existing interval
    if (loopIntervalRef.current) {
      clearInterval(loopIntervalRef.current)
    }

    loopIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - loopStartTimeRef.current
      const progress = Math.min((elapsed / intervalMs) * 100, 100)
      setLoopProgress(progress)

      if (elapsed >= intervalMs) {
        // Advance to next slide using refs (to avoid stale closure)
        advanceLoopSlide()
      }
    }, updateInterval)
  }

  // Advance to next slide in loop (uses refs to avoid stale closure)
  const advanceLoopSlide = async () => {
    const folder = folderRef.current
    if (!folder || folder.slides.length === 0) return

    const nextIndex = (folderSlideIndexRef.current + 1) % folder.slides.length
    folderSlideIndexRef.current = nextIndex

    const slide = folder.slides[nextIndex]

    setState(prev => ({ ...prev, folderSlideIndex: nextIndex }))

    // Update preview
    const url = await getSignedMediaUrl(slide.storagePath)
    setCurrentBackgroundUrl(url)

    // Send to displays
    await sendMediaToDisplays(slide)

    // Calculate effective loop time for this slide
    const effectiveTime = getEffectiveLoopTime(slide, folder)
    setCurrentLoopTime(effectiveTime)

    // Handle per-slide loop time
    if (effectiveTime === 0) {
      // Stop looping on this slide
      stopLoop()
    } else {
      // Restart timer with new interval (might be different for this slide)
      loopStartTimeRef.current = Date.now()
      setLoopProgress(0)

      // Clear and restart with new interval if it changed
      if (loopIntervalRef.current) {
        clearInterval(loopIntervalRef.current)
      }

      const intervalMs = effectiveTime * 1000
      const updateInterval = 100

      loopIntervalRef.current = window.setInterval(() => {
        const elapsed = Date.now() - loopStartTimeRef.current
        const progress = Math.min((elapsed / intervalMs) * 100, 100)
        setLoopProgress(progress)

        if (elapsed >= intervalMs) {
          advanceLoopSlide()
        }
      }, updateInterval)
    }
  }

  // Stop auto-loop
  const stopLoop = () => {
    if (loopIntervalRef.current) {
      clearInterval(loopIntervalRef.current)
      loopIntervalRef.current = null
    }
    setLoopActive(false)
    setLoopProgress(0)
  }

  // Toggle loop for folder
  const toggleLoop = () => {
    if (loopActive) {
      stopLoop()
    } else if (state.currentFolder && state.currentFolder.slides.length > 0) {
      // Calculate effective loop time for current slide
      const currentSlide = state.currentFolder.slides[state.folderSlideIndex]
      const effectiveTime = getEffectiveLoopTime(currentSlide, state.currentFolder)
      if (effectiveTime > 0) {
        startLoop(effectiveTime)
      }
    }
  }

  // Go to next folder slide (with wrap-around)
  const goToNextFolderSlide = async () => {
    if (!state.currentFolder || state.currentFolder.slides.length === 0) return

    const nextIndex = (state.folderSlideIndex + 1) % state.currentFolder.slides.length
    await goToFolderSlide(nextIndex)
  }

  // Go to previous folder slide (with wrap-around)
  const goToPrevFolderSlide = async () => {
    if (!state.currentFolder || state.currentFolder.slides.length === 0) return

    const prevIndex = state.folderSlideIndex === 0
      ? state.currentFolder.slides.length - 1
      : state.folderSlideIndex - 1
    await goToFolderSlide(prevIndex)
  }

  // Go to specific folder slide
  const goToFolderSlide = async (index: number) => {
    if (!state.currentFolder || index < 0 || index >= state.currentFolder.slides.length) return

    const slide = state.currentFolder.slides[index]

    // Update ref for loop
    folderSlideIndexRef.current = index

    setState(prev => ({ ...prev, folderSlideIndex: index }))

    // Update preview
    const url = await getSignedMediaUrl(slide.storagePath)
    setCurrentBackgroundUrl(url)

    // Send to displays
    await sendMediaToDisplays(slide)

    // Update effective loop time for this slide
    const effectiveTime = getEffectiveLoopTime(slide, state.currentFolder)
    setCurrentLoopTime(effectiveTime)

    // If loop is active, handle per-slide loop time
    if (loopActive) {
      if (effectiveTime === 0) {
        // Stop looping on this slide
        stopLoop()
      } else {
        // Restart timer with new interval
        startLoop(effectiveTime)
      }
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
            const cacheKey = `bg:${mediaId}`
            const cached = mediaDataUrlCache.get(cacheKey)
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

        if (isTauri()) {
          const { emit } = await import('@tauri-apps/api/event')
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
      }
    } catch (error) {
      console.error('[Controller] Failed to emit Tauri event for slide:', error)
    }

    // Broadcast slide update to remote displays via WebSocket
    broadcastSlide({
      church_id: currentChurch?.id || '',
      event_id: state.currentEventId || '',
      song_id: songId,
      slide_index: slideIndex,
      timestamp: Date.now(),
    })
    console.log('[Controller] Broadcast slide update to', connected.size, 'WebSocket connections')
  }

  // Navigate to specific slide (for songs)
  const goToSlide = async (index: number) => {
    if (!state.currentSongId || index < 0 || index >= state.slides.length) return

    setState(prev => ({ ...prev, currentSlideIndex: index }))
    await sendSlideUpdate(state.currentSongId, index)
  }

  // Navigate to next/previous slide
  const goToNext = useCallback(async () => {
    if (state.displayMode === 'song') {
      const nextIndex = state.currentSlideIndex + 1
      if (nextIndex < state.slides.length) {
        await goToSlide(nextIndex)
      }
    } else if (state.displayMode === 'folder') {
      await goToNextFolderSlide()
    }
  }, [state.displayMode, state.currentSlideIndex, state.slides.length, state.folderSlideIndex, state.currentFolder])

  const goToPrevious = useCallback(async () => {
    if (state.displayMode === 'song') {
      const prevIndex = state.currentSlideIndex - 1
      if (prevIndex >= 0) {
        await goToSlide(prevIndex)
      }
    } else if (state.displayMode === 'folder') {
      await goToPrevFolderSlide()
    }
  }, [state.displayMode, state.currentSlideIndex, state.folderSlideIndex, state.currentFolder])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goToPrevious()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goToNext()
      } else if (e.key === ' ' && state.displayMode === 'folder') {
        e.preventDefault()
        toggleLoop()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToPrevious, goToNext, state.displayMode])

  // Get current slide for display
  const currentSlide = state.displayMode === 'song'
    ? state.slides[state.currentSlideIndex] || null
    : null

  // Get current index and total for control buttons
  const currentIndex = state.displayMode === 'song'
    ? state.currentSlideIndex
    : state.displayMode === 'folder'
      ? state.folderSlideIndex
      : 0

  const totalSlides = state.displayMode === 'song'
    ? state.slides.length
    : state.displayMode === 'folder'
      ? state.currentFolder?.slides.length || 0
      : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
    <div className="container mx-auto p-4 space-y-4 flex-1 overflow-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        {/* Back button */}
        <Button variant="ghost" size="icon" onClick={() => navigate('/events')} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>

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
              <CardTitle className="flex items-center justify-between">
                <span>{t('live.preview')}</span>
                {state.displayMode === 'folder' && state.currentFolder && (
                  <div className="flex items-center gap-2">
                    {(state.currentFolder.defaultLoopTime > 0 || currentLoopTime > 0) && (
                      <Button
                        variant={loopActive ? 'default' : 'outline'}
                        size="sm"
                        onClick={toggleLoop}
                        className="gap-1"
                        disabled={currentLoopTime === 0}
                        title={currentLoopTime === 0 ? 'Loop paused on this slide' : undefined}
                      >
                        {loopActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                        <Clock className="h-3 w-3" />
                        {currentLoopTime}s
                      </Button>
                    )}
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {state.displayMode === 'song' ? (
                <SlidePreview slide={currentSlide} backgroundUrl={currentBackgroundUrl} />
              ) : state.displayMode === 'slide' || state.displayMode === 'folder' ? (
                <div className="aspect-video bg-black rounded-lg overflow-hidden relative">
                  {currentBackgroundUrl && (
                    <img
                      src={currentBackgroundUrl}
                      alt="Slide preview"
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>
              ) : (
                <div className="aspect-video bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
                  {t('live.selectItem')}
                </div>
              )}
              {/* Loop progress bar */}
              {state.displayMode === 'folder' && loopActive && (
                <Progress value={loopProgress} className="mt-2 h-1" />
              )}
            </CardContent>
          </Card>

          {/* Control buttons */}
          <Card>
            <CardContent className="pt-6">
              <ControlButtons
                currentIndex={currentIndex}
                totalSlides={totalSlides}
                onPrevious={goToPrevious}
                onNext={goToNext}
              />
            </CardContent>
          </Card>

          {/* Slide navigator (for songs) or folder slides */}
          {state.displayMode === 'song' && (
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
          )}

          {state.displayMode === 'folder' && state.currentFolder && (
            <Card>
              <CardHeader>
                <CardTitle>{state.currentFolder.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2">
                  {state.currentFolder.slides.map((slide, idx) => (
                    <button
                      key={slide.id}
                      onClick={() => goToFolderSlide(idx)}
                      className={`aspect-video rounded overflow-hidden bg-black border-2 transition-colors ${
                        idx === state.folderSlideIndex
                          ? 'border-primary'
                          : 'border-transparent hover:border-muted-foreground'
                      }`}
                    >
                      {folderSlideUrls.get(slide.id) ? (
                        <img
                          src={folderSlideUrls.get(slide.id)}
                          alt={slide.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                          Loading...
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: Setlist */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('events.items')}</CardTitle>
            </CardHeader>
            <CardContent>
              <SetlistPicker
                items={state.setlist}
                currentItemId={state.currentItemId}
                onSelectItem={selectItem}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
    </div>
  )
}
