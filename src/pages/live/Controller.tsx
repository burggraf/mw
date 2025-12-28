import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChurch } from '@/contexts/ChurchContext'
import { useWebRTC } from '@/hooks/useWebRTC'
import { getEventItems } from '@/services/events'
import { getSong } from '@/services/songs'
import { generateSlides } from '@/lib/slide-generator'
import type { Slide } from '@/types/live'
import type { Song } from '@/types/song'
import type { Event, EventItemWithData } from '@/types/event'
import { SlidePreview, SetlistPicker, SlideNavigator, ControlButtons } from '@/components/live'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Wifi, WifiOff, Loader2 } from 'lucide-react'

interface ControllerState {
  currentEventId: string | null
  currentSong: Song | null
  currentItemId: string | null
  currentSlideIndex: number
  slides: Slide[]
  setlist: EventItemWithData[]
}

export function Controller() {
  const { t } = useTranslation()
  const { currentChurch } = useChurch()
  const {
    peers,
    isConnected,
    startPeer,
    sendMessage,
  } = useWebRTC()

  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [startingPeer, setStartingPeer] = useState(false)
  const [state, setState] = useState<ControllerState>({
    currentEventId: null,
    currentSong: null,
    currentItemId: null,
    currentSlideIndex: 0,
    slides: [],
    setlist: [],
  })

  // Count connected display peers
  const displayCount = peers.filter(p => p.peer_type === 'display' && p.is_connected).length

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

  // Start WebRTC peer in controller mode
  useEffect(() => {
    if (!currentChurch?.id) return

    async function startControllerPeer() {
      try {
        setStartingPeer(true)
        await startPeer('controller', `${currentChurch!.name} Controller`)
      } catch (error) {
        console.error('Failed to start controller peer:', error)
      } finally {
        setStartingPeer(false)
      }
    }

    startControllerPeer()
  }, [currentChurch?.id])

  // Select event and load setlist
  const selectEvent = useCallback(async (eventId: string) => {
    try {
      const items = await getEventItems(eventId)
      setState(prev => ({
        ...prev,
        currentEventId: eventId,
        setlist: items,
        currentSong: null,
        currentItemId: null,
        currentSlideIndex: 0,
        slides: [],
      }))
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
        currentItemId: itemId,
        currentSlideIndex: 0,
        slides,
      }))

      // Send first slide to displays
      await sendSlideUpdate(itemId, 0)
    } catch (error) {
      console.error('Failed to select song:', error)
    }
  }

  // Send slide update to all connected displays
  const sendSlideUpdate = async (itemId: string, slideIndex: number) => {
    if (!state.currentEventId) return

    const message = JSON.stringify({
      type: 'slide',
      eventId: state.currentEventId,
      itemId,
      slideIndex,
    })

    // Send to all display peers
    const displayPeers = peers.filter(p => p.peer_type === 'display' && p.is_connected)
    for (const peer of displayPeers) {
      try {
        await sendMessage(peer.id, message)
      } catch (error) {
        console.error(`Failed to send slide to ${peer.display_name}:`, error)
      }
    }
  }

  // Navigate to specific slide
  const goToSlide = async (index: number) => {
    if (!state.currentItemId || index < 0 || index >= state.slides.length) return

    setState(prev => ({ ...prev, currentSlideIndex: index }))
    await sendSlideUpdate(state.currentItemId, index)
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
  }, [state.currentSlideIndex, state.slides.length, state.currentItemId])

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
          {startingPeer ? (
            <Badge variant="outline" className="gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t('live.display.connecting')}
            </Badge>
          ) : isConnected ? (
            <Badge variant="outline" className="gap-1 text-green-600">
              <Wifi className="w-3 h-3" />
              {t('live.display.connected', { count: displayCount })}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <WifiOff className="w-3 h-3" />
              {t('live.display.disconnected')}
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
              <SlidePreview slide={currentSlide} />
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
