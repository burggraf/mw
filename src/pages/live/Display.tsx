import { useEffect, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useChurch } from '@/contexts/ChurchContext'
import { generateSlides } from '@/lib/slide-generator'
import type { Slide } from '@/types/live'
import type { Song } from '@/types/song'

type WsMessage =
  | { type: 'lyrics'; data: { church_id: string; event_id: string; song_id: string; title: string; lyrics: string; background_url?: string; timestamp: number } }
  | { type: 'slide'; data: { church_id: string; event_id: string; song_id: string; slide_index: number; timestamp: number } }
  | { type: 'ping' }

// Check if we're running as a local display window (same Tauri process as controller)
const isLocalDisplayWindow = (): boolean => {
  // Check URL parameter first
  const urlParams = new URLSearchParams(window.location.search)
  if (urlParams.get('localMode') === 'true') {
    console.log('[Display] Detected local mode from URL param')
    return true
  }

  // Fallback: check if window label starts with "display-" for auto-started local windows
  const win = window as any
  const internalsLabel = win.__TAURI_INTERNALS__?.windowConfig?.label
  const tauriLabel = win.__TAURI__?.windowLabel
  const label = internalsLabel || tauriLabel
  if (label && label.startsWith('display-')) {
    console.log('[Display] Detected local mode from window label:', label)
    return true
  }

  console.log('[Display] Not running in local mode')
  return false
}

interface DisplayPageProps {
  eventId: string
  displayName?: string
}

// In-memory caches
const songCache = new Map<string, { song: Song; updated_at: string }>()
const mediaPathCache = new Map<string, { filePath: string; updatedAt: string; isColor: boolean }>()

export function DisplayPage({ eventId, displayName = 'Display' }: DisplayPageProps) {
  const { t } = useTranslation()
  const { currentChurch } = useChurch()
  const localMode = isLocalDisplayWindow()

  const [currentSlide, setCurrentSlide] = useState<Slide | null>(null)
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null)
  const [backgroundColor, setBackgroundColor] = useState<string | null>(null)
  const [isWaiting, setIsWaiting] = useState(true)
  const [opacity, setOpacity] = useState(0)

  // Refs to track current song/slide for refresh when media arrives
  const currentSongIdRef = useRef<string | null>(null)
  const currentSlideIndexRef = useRef<number | null>(null)
  const currentSlideRef = useRef<Slide | null>(null)
  const backgroundUrlRef = useRef<string | null>(null)
  const serverPortRef = useRef<number | null>(null)
  const isInitializingRef = useRef<boolean>(false)

  // Initialize WebSocket server on mount for remote displays
  useEffect(() => {
    // Mark as initializing IMMEDIATELY at the start to prevent duplicate runs
    // This must be the FIRST thing checked to prevent React strict mode from running twice
    if (isInitializingRef.current || serverPortRef.current !== null) {
      console.log('[Display] Already initialized or initializing, skipping')
      return
    }
    isInitializingRef.current = true

    // Check if Tauri APIs are available
    const hasTauri = typeof window !== 'undefined' &&
      ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)
    console.log('[Display] Tauri available:', hasTauri)

    if (localMode) {
      console.log('[Display] Running in local mode - using Tauri events')
      setIsWaiting(false)
      return
    }

    console.log('[Display] Remote mode - starting WebSocket server')

    // Use a flag to track if this specific effect run completed successfully
    let thisRunCompleted = false

    let ws: WebSocket | null = null

    const startServerAndListen = async () => {
      try {
        // Get or generate device ID first
        const id = await invoke<string>('get_device_id')
        console.log('[Display] Got device ID:', id)

        // Start the WebSocket server
        const port = await invoke<number>('start_websocket_server')
        serverPortRef.current = port
        console.log('[Display] WebSocket server started on port', port)

        // Also advertise via mDNS
        // Use a simple device name - will be updated when church loads
        const deviceName = `${currentChurch?.name || 'Mobile Worship'} Display`
        try {
          await invoke('start_advertising', { name: deviceName, port, deviceId: id })
          console.log('[Display] Advertising as', deviceName, 'with device ID:', id)
        } catch (e) {
          console.error('[Display] mDNS advertising failed:', e)
        }

        // Start UDP listener for broadcast discovery fallback
        // This allows discovery on networks where mDNS is blocked
        try {
          await invoke('start_udp_listener', { port: 48488, wsPort: port })
          console.log('[Display] UDP listener started on port 48488')
        } catch (e) {
          console.error('[Display] UDP listener failed:', e)
        }

        setIsWaiting(false)

        // Mark this run as completed successfully
        thisRunCompleted = true

        // Connect to our own server to receive messages
        ws = new WebSocket(`ws://localhost:${port}`)

        ws.onopen = () => {
          console.log('[Display] Connected to local WebSocket server')
        }

        ws.onmessage = (event) => {
          try {
            const message: WsMessage = JSON.parse(event.data)

            if (message.type === 'lyrics') {
              // Check if this message is for our church/event
              if (message.data.church_id === currentChurch?.id &&
                  message.data.event_id === eventId) {
                // Cache the song data
                const song: Song = {
                  id: message.data.song_id,
                  churchId: currentChurch?.id || '',
                  title: message.data.title,
                  content: message.data.lyrics,
                  author: null,
                  copyrightInfo: null,
                  ccliNumber: null,
                  arrangements: { default: [] },
                  backgrounds: {},
                  audienceBackgroundId: null,
                  stageBackgroundId: null,
                  lobbyBackgroundId: null,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date(message.data.timestamp).toISOString(),
                }

                const cached = songCache.get(song.id)
                if (!cached || cached.updated_at < String(message.data.timestamp)) {
                  songCache.set(song.id, { song, updated_at: String(message.data.timestamp) })
                }

                // Load the first slide if not already showing
                if (!currentSlideRef.current) {
                  loadSlide(song.id, 0)
                }
              }
            } else if (message.type === 'slide') {
              if (message.data.church_id === currentChurch?.id &&
                  message.data.event_id === eventId) {
                loadSlide(message.data.song_id, message.data.slide_index)
              }
            }
          } catch (e) {
            console.error('[Display] Failed to parse WebSocket message:', e)
          }
        }

        ws.onerror = (error) => {
          console.error('[Display] WebSocket error:', error)
        }

        ws.onclose = () => {
          console.log('[Display] WebSocket closed')
        }
      } catch (e) {
        console.error('[Display] Failed to start WebSocket server:', e)
        console.error('[Display] Error details:', JSON.stringify(e))
        setIsWaiting(false)
        // Reset initialization flag on error so it can be retried
        isInitializingRef.current = false
      }
    }

    startServerAndListen()

    return () => {
      // Only cleanup WebSocket, don't reset the initialization flag
      // This prevents React strict mode remounts from unregistering the mDNS service
      if (ws) ws.close()
      // Only reset if this run never completed (error case)
      if (!thisRunCompleted) {
        isInitializingRef.current = false
      }
      // TODO: Add server cleanup - stop_websocket_server and stop_advertising commands
    }
  }, [localMode]) // Removed currentChurch and eventId - only run once per localMode change

  // Get background for a song
  const getSongBackground = useCallback((song: Song): { url?: string; color?: string } => {
    const mediaId = song.backgrounds?.default || undefined
    if (!mediaId) {
      return {}
    }

    const cached = mediaPathCache.get(mediaId)
    if (!cached) {
      return {}
    }

    if (cached.isColor) {
      return { color: cached.filePath }
    }
    const url = cached.filePath
    return { url }
  }, [])

  // Load slide from cached song data
  const loadSlide = useCallback((songId: string, slideIndex: number) => {
    console.log('[Display] Loading slide from cache:', { songId, slideIndex })

    currentSongIdRef.current = songId
    currentSlideIndexRef.current = slideIndex

    const cached = songCache.get(songId)
    if (!cached) {
      console.warn('[Display] Song not in cache:', songId)
      setIsWaiting(true)
      return
    }

    const { song } = cached
    const background = getSongBackground(song)
    const slides = generateSlides(song)

    if (slideIndex >= 0 && slideIndex < slides.length) {
      const newSlide = slides[slideIndex]

      // Trigger crossfade
      setOpacity(0)

      setTimeout(() => {
        setCurrentSlide(newSlide)
        currentSlideRef.current = newSlide

        if (background.url) {
          setBackgroundUrl(background.url)
          setBackgroundColor(null)
        } else if (background.color) {
          setBackgroundColor(background.color)
          setBackgroundUrl(null)
        } else {
          setBackgroundUrl(null)
          setBackgroundColor(null)
        }
        backgroundUrlRef.current = background.url || null

        // Fade in
        setOpacity(1)
      }, 300)
    }
  }, [getSongBackground])

  // Listen for data messages (Tauri events for local displays)
  useEffect(() => {
    if (localMode) {
      console.log('[Display] Registering Tauri display:slide event handler (local mode)')

      const unlistenPromise = listen<{ songData?: { song: Song & { updated_at: string }, backgroundDataUrls?: Record<string, string> }, itemId?: string, slideIndex?: number }>(
        'display:slide',
        (event) => {
          console.log('[Display] Received local Tauri event:', event.payload)

          const { songData, itemId, slideIndex } = event.payload

          if (songData?.song) {
            const cached = songCache.get(songData.song.id)
            if (!cached || cached.updated_at < songData.song.updated_at) {
              songCache.set(songData.song.id, { song: songData.song, updated_at: songData.song.updated_at })

              if (songData.backgroundDataUrls) {
                for (const [key, dataUrl] of Object.entries(songData.backgroundDataUrls)) {
                  const mediaId = songData.song.backgrounds?.[key]
                  if (mediaId && dataUrl) {
                    mediaPathCache.set(mediaId, {
                      filePath: dataUrl,
                      updatedAt: songData.song.updatedAt,
                      isColor: false,
                    })
                  }
                }
              }
            }
          }

          if (itemId && slideIndex !== undefined) {
            loadSlide(itemId, slideIndex)
            setIsWaiting(false)
          }
        }
      )

      return () => {
        unlistenPromise.then?.(unlisten => unlisten?.()).catch?.(() => {})
      }
    } else {
      // Remote mode - WebSocket listening handled in the initialization useEffect above
      return () => {}
    }
  }, [eventId, loadSlide, localMode])

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
      {/* Background */}
      {backgroundUrl ? (
        <img
          src={backgroundUrl}
          alt=""
          className="absolute inset-0 object-cover"
          onError={(e) => console.error('[Display] Image failed to load:', backgroundUrl, e)}
          onLoad={() => console.log('[Display] Image loaded successfully:', backgroundUrl)}
        />
      ) : backgroundColor ? (
        <div className="absolute inset-0" style={{ backgroundColor }} />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-800" />
      )}

      {/* Slide content */}
      {currentSlide ? (
        <div
          className="relative z-10 max-w-5xl px-16 text-center transition-opacity duration-300"
          style={{ opacity }}
        >
          {currentSlide.sectionLabel && (
            <div className="text-2xl font-semibold text-white/90 mb-4 drop-shadow-lg">
              {currentSlide.sectionLabel}
            </div>
          )}
          <div className="text-5xl font-bold text-white leading-relaxed whitespace-pre-wrap drop-shadow-2xl">
            {currentSlide.text}
          </div>
        </div>
      ) : isWaiting ? (
        <div className="relative z-10 text-center space-y-4">
          {displayName && (
            <div className="text-xl font-medium text-white/60 drop-shadow-lg">
              {displayName}
            </div>
          )}
          <div className="text-4xl font-semibold text-white/80 drop-shadow-lg">
            {t('live.display.waitingForEvent', 'Waiting for event...')}
          </div>
        </div>
      ) : null}

      {/* Debug/test button - only visible in development */}
      {import.meta.env.DEV && (
        <div className="fixed bottom-4 left-4 z-50">
          <button
            onClick={async () => {
              try {
                await invoke('test_emit_event', { message: 'Hello from Display!' })
              } catch (e) {
                console.error('[Display] Test failed', e)
              }
            }}
            className="px-3 py-1.5 bg-blue-500/90 hover:bg-blue-600 text-white rounded-full text-sm font-medium"
          >
            Test Event
          </button>
        </div>
      )}

      {/* Connection status indicator */}
      <div className="fixed bottom-4 right-4 z-50">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-green-500/90 text-white">
          <div className="w-2 h-2 rounded-full bg-white" />
          <span>
            {localMode
              ? t('live.display.connected', 'Local Display')
              : t('live.display.connected', 'Remote Display')}
          </span>
        </div>
      </div>
    </div>
  )
}
