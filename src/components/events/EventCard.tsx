import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { useChurch } from '@/contexts/ChurchContext'
import { useWebSocketConnections } from '@/contexts/WebSocketContext'
import type { Event } from '@/types/event'
import type { Display, DiscoveredDisplay } from '@/types/display'
import type { PrecacheMediaItem, PrecacheSongItem } from '@/types/live'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar, Music, Image, Play, Loader2 } from 'lucide-react'
import { EventDisplaysAccordion } from '@/components/displays/EventDisplaysAccordion'
import { getDisplaysForChurch } from '@/services/displays'
import { getEventItems } from '@/services/events'
import { getSong } from '@/services/songs'
import { getMediaById, getSignedMediaUrl } from '@/services/media'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

interface EventCardProps {
  event: Event
  itemCounts?: { songs: number; slides: number }
}

export function EventCard({ event, itemCounts }: EventCardProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { currentChurch } = useChurch()
  const { connect, broadcastPrecache, discover } = useWebSocketConnections()
  const totalItems = (itemCounts?.songs || 0) + (itemCounts?.slides || 0)
  const scheduledDate = new Date(event.scheduledAt)
  const isPast = scheduledDate < new Date()

  const [displays, setDisplays] = useState<Display[]>([])
  const [selectedDisplayIds, setSelectedDisplayIds] = useState<string[]>([])
  const [isStarting, setIsStarting] = useState(false)
  const [startStatus, setStartStatus] = useState<string>('')

  useEffect(() => {
    if (currentChurch) {
      getDisplaysForChurch(currentChurch.id).then(setDisplays)
    }
  }, [currentChurch])

  const handleCardClick = () => {
    navigate(`/events/${event.id}`)
  }

  const handleStart = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!currentChurch) return

    // If no displays selected, just go to controller
    if (selectedDisplayIds.length === 0) {
      navigate('/live/controller', { state: { eventId: event.id } })
      return
    }

    setIsStarting(true)
    setStartStatus(t('events.connecting', 'Connecting to displays...'))

    try {
      // 1. Connect to selected displays
      // First, do a fresh mDNS discovery to get current host/port
      const freshDiscovered = await discover()

      const selectedDisplays = displays.filter(d => selectedDisplayIds.includes(d.id) && d.isOnline)

      if (selectedDisplays.length === 0) {
        toast.error(t('displays.noOnlineDisplays', 'No online displays selected'))
        setIsStarting(false)
        return
      }

      // Helper to find mDNS-discovered display by matching displayId or deviceId
      const findDiscoveredDisplay = (dbDisplay: Display): DiscoveredDisplay | undefined => {
        return freshDiscovered.find(d =>
          d.displayId === dbDisplay.displayId ||
          d.deviceId === dbDisplay.deviceId ||
          d.displayId === dbDisplay.deviceId // fallback for single-display devices
        )
      }

      // Connect using mDNS-discovered data (live) if available, otherwise database data (may be stale)
      for (const display of selectedDisplays) {
        const discoveredDisplay = findDiscoveredDisplay(display)
        if (discoveredDisplay) {
          // Use live mDNS data - this has the current port
          console.log('[EventCard] Using mDNS discovery data for', display.name, 'host:', discoveredDisplay.host, 'port:', discoveredDisplay.port)
          connect({ host: discoveredDisplay.host, port: discoveredDisplay.port, name: display.name })
        } else if (display.host && display.port) {
          // Fallback to database data (may have stale port)
          console.log('[EventCard] Using database data for', display.name, 'host:', display.host, 'port:', display.port, '(mDNS not found)')
          connect({ host: display.host, port: display.port, name: display.name })
        } else {
          console.warn('[EventCard] No connection info for display:', display.name)
        }
      }

      // Wait for connections to establish (with timeout check)
      let attempts = 0
      const maxAttempts = 10
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 300))
        // Check if at least one connection is ready
        // For now just wait the full time
        attempts++
      }

      // 2. Load event items and collect all media needed
      setStartStatus(t('events.loadingMedia', 'Loading media...'))
      const items = await getEventItems(event.id)

      const mediaItems: PrecacheMediaItem[] = []
      const songItems: PrecacheSongItem[] = []
      const mediaIdsSeen = new Set<string>()

      // URL expiration: 1 hour from now
      const expiresAt = Date.now() + 3600 * 1000

      for (const item of items) {
        if (item.itemType === 'song' && item.itemId) {
          const song = await getSong(item.itemId)
          if (song) {
            // Add song to precache list
            // Filter out undefined values from backgrounds
            const cleanBackgrounds: Record<string, string> = {}
            for (const [key, value] of Object.entries(song.backgrounds || {})) {
              if (value) cleanBackgrounds[key] = value
            }
            songItems.push({
              songId: song.id,
              title: song.title,
              lyrics: song.content,
              backgrounds: cleanBackgrounds,
              updatedAt: song.updatedAt,
            })

            // Collect all background media IDs
            const backgrounds = song.backgrounds || {}
            for (const mediaId of Object.values(backgrounds)) {
              if (mediaId && !mediaIdsSeen.has(mediaId)) {
                mediaIdsSeen.add(mediaId)

                const media = await getMediaById(mediaId)
                if (media?.storagePath) {
                  const url = await getSignedMediaUrl(media.storagePath, 3600)
                  mediaItems.push({
                    mediaId,
                    url,
                    type: media.type as 'image' | 'video',
                    expiresAt,
                  })
                }
              }
            }
          }
        } else if (item.itemType === 'slide' && item.slide) {
          // Individual slide items
          if (!mediaIdsSeen.has(item.itemId)) {
            mediaIdsSeen.add(item.itemId)
            if (item.slide.storagePath) {
              const url = await getSignedMediaUrl(item.slide.storagePath, 3600)
              mediaItems.push({
                mediaId: item.itemId,
                url,
                type: item.slide.type as 'image' | 'video',
                expiresAt,
              })
            }
          }
        } else if (item.itemType === 'slideFolder' && item.slideFolder) {
          // Slide folder - add all slides in the folder
          for (const slide of item.slideFolder.slides) {
            if (!mediaIdsSeen.has(slide.id)) {
              mediaIdsSeen.add(slide.id)
              if (slide.storagePath) {
                const url = await getSignedMediaUrl(slide.storagePath, 3600)
                mediaItems.push({
                  mediaId: slide.id,
                  url,
                  type: slide.type as 'image' | 'video',
                  expiresAt,
                })
              }
            }
          }
        }
      }

      // 3. Send precache message to displays
      if (mediaItems.length > 0 || songItems.length > 0) {
        setStartStatus(t('events.sendingToDisplays', 'Sending to displays...'))
        broadcastPrecache({
          churchId: currentChurch.id,
          eventId: event.id,
          media: mediaItems,
          songs: songItems,
        })

        // Wait a moment for displays to start caching
        // In a future version, we could wait for precache_ack responses
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      // 4. Navigate to controller
      setStartStatus(t('events.starting', 'Starting...'))
      navigate('/live/controller', { state: { eventId: event.id } })

    } catch (error) {
      console.error('Failed to start event:', error)
      toast.error(t('events.startFailed', 'Failed to start event'))
    } finally {
      setIsStarting(false)
      setStartStatus('')
    }
  }

  return (
    <Card className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={handleCardClick}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{event.name}</h3>
            {event.description && (
              <p className="text-sm text-muted-foreground truncate mt-1">
                {event.description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="default"
              onClick={handleStart}
              disabled={isStarting}
              className="shrink-0 min-w-[80px]"
            >
              {isStarting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  {startStatus || t('events.starting', 'Starting...')}
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1" />
                  {t('events.start')}
                </>
              )}
            </Button>

            <div className={`text-right shrink-0 ${isPast ? 'text-muted-foreground' : ''}`}>
              <div className="flex items-center gap-1.5 text-sm">
                <Calendar className="h-4 w-4" />
                <span>{format(scheduledDate, 'MMM d, yyyy')}</span>
              </div>
              <div className="text-sm text-muted-foreground mt-0.5">
                {format(scheduledDate, 'h:mm a')}
              </div>
            </div>
          </div>
        </div>

        {itemCounts && totalItems > 0 && (
          <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
            {itemCounts.songs > 0 && (
              <div className="flex items-center gap-1">
                <Music className="h-3.5 w-3.5" />
                <span>{itemCounts.songs}</span>
              </div>
            )}
            {itemCounts.slides > 0 && (
              <div className="flex items-center gap-1">
                <Image className="h-3.5 w-3.5" />
                <span>{itemCounts.slides}</span>
              </div>
            )}
          </div>
        )}

        {/* Displays for this event */}
        <div className="mt-4" onClick={(e) => e.stopPropagation()}>
          <EventDisplaysAccordion
            displays={displays}
            selectedDisplayIds={selectedDisplayIds}
            onSelectionChange={setSelectedDisplayIds}
          />
        </div>
      </CardContent>
    </Card>
  )
}
