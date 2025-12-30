import { useEffect, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useChurch } from '@/contexts/ChurchContext'
import { generateSlides } from '@/lib/slide-generator'
import type { Slide, PrecacheMessage, PrecacheAck } from '@/types/live'
import type { Song } from '@/types/song'
import {
  precacheMedia,
  precacheSongs,
  getCachedMediaUrl,
  getAllStatuses,
} from '@/services/media-cache'
import { updateDisplayConnection } from '@/services/displays'
import { exit } from '@tauri-apps/plugin-process'

type WsMessage =
  | { type: 'lyrics'; data: { church_id: string; event_id: string; song_id: string; title: string; lyrics: string; background_url?: string; timestamp: number } }
  | { type: 'slide'; data: { church_id: string; event_id: string; song_id: string; slide_index: number; timestamp: number } }
  | { type: 'precache'; data: PrecacheMessage }
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
  const [isCaching, setIsCaching] = useState(false)
  const [cacheProgress, setCacheProgress] = useState<string>('')
  const [showMenu, setShowMenu] = useState(false)
  const [menuIndex, setMenuIndex] = useState(0)
  const [isAndroid, setIsAndroid] = useState(false)
  const [connectionCount, setConnectionCount] = useState(0)

  // Refs to track current song/slide for refresh when media arrives
  const currentSongIdRef = useRef<string | null>(null)
  const currentSlideIndexRef = useRef<number | null>(null)
  const currentSlideRef = useRef<Slide | null>(null)
  const backgroundUrlRef = useRef<string | null>(null)
  const serverPortRef = useRef<number | null>(null)
  const isInitializingRef = useRef<boolean>(false)
  const wsConnectionRef = useRef<WebSocket | null>(null)

  // Detect Android platform on mount
  useEffect(() => {
    const checkPlatform = async () => {
      try {
        const platform = await invoke<string>('get_platform')
        setIsAndroid(platform === 'android')
        console.log('[Display] Platform detected:', platform)
      } catch {
        // Fallback to user agent
        const ua = navigator.userAgent
        setIsAndroid(ua.includes('Android'))
      }
    }
    checkPlatform()
  }, [])

  // Menu action handler (defined before useEffect that uses it)
  const handleMenuAction = useCallback(async (index: number) => {
    switch (index) {
      case 0: // Resume
        setShowMenu(false)
        break
      case 1: // About
        // Could show an about dialog, for now just close
        setShowMenu(false)
        break
      case 2: // Exit
        try {
          await exit(0)
        } catch (e) {
          console.error('[Display] Failed to exit:', e)
          window.close()
        }
        break
    }
  }, [])

  // D-pad / keyboard navigation for Android TV menu
  useEffect(() => {
    if (!isAndroid) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Debug: log all key events on Android
      console.log('[Display] Key event:', {
        key: e.key,
        code: e.code,
        keyCode: e.keyCode,
        which: e.which,
      })

      // Try multiple ways to detect the center/OK button
      // KEYCODE_DPAD_CENTER = 23, KEYCODE_ENTER = 66
      const isCenterButton =
        e.key === 'Enter' ||
        e.key === 'OK' ||
        e.key === 'Accept' ||
        e.keyCode === 13 ||   // standard Enter
        e.keyCode === 23 ||   // Android DPAD_CENTER
        e.keyCode === 66 ||   // Android ENTER
        e.which === 23 ||
        e.which === 66 ||
        e.code === 'Enter'

      if (isCenterButton) {
        console.log('[Display] Center/OK button pressed, menu currently:', showMenu)
        if (!showMenu) {
          setShowMenu(true)
          setMenuIndex(0)
        } else {
          // Execute selected menu item
          handleMenuAction(menuIndex)
        }
        e.preventDefault()
        e.stopPropagation()
        return
      }

      // Only handle navigation when menu is open
      if (!showMenu) return

      // Up arrow / d-pad up (KEYCODE_DPAD_UP = 19)
      if (
        e.key === 'ArrowUp' ||
        e.keyCode === 38 ||
        e.keyCode === 19
      ) {
        setMenuIndex(i => Math.max(0, i - 1))
        e.preventDefault()
        e.stopPropagation()
      }
      // Down arrow / d-pad down (KEYCODE_DPAD_DOWN = 20)
      else if (
        e.key === 'ArrowDown' ||
        e.keyCode === 40 ||
        e.keyCode === 20
      ) {
        setMenuIndex(i => Math.min(2, i + 1))
        e.preventDefault()
        e.stopPropagation()
      }
      // Back button (KEYCODE_BACK = 4)
      else if (
        e.key === 'Escape' ||
        e.key === 'Back' ||
        e.keyCode === 27 ||
        e.keyCode === 4
      ) {
        setShowMenu(false)
        e.preventDefault()
        e.stopPropagation()
      }
    }

    // Also listen for click/tap events (some Android TV remotes send click instead of key)
    const handleClick = (e: MouseEvent | PointerEvent) => {
      console.log('[Display] Click event:', { type: e.type, target: e.target })
      // Only trigger if clicking on the main display area (not buttons)
      if ((e.target as HTMLElement).tagName === 'DIV' || (e.target as HTMLElement).tagName === 'BODY') {
        console.log('[Display] Click on main area, toggling menu')
        setShowMenu(!showMenu)
        setMenuIndex(0)
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    window.addEventListener('click', handleClick, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
      window.removeEventListener('click', handleClick, { capture: true })
    }
  }, [isAndroid, showMenu, menuIndex, handleMenuAction])

  // Handle precache message from controller
  const handlePrecache = useCallback(async (data: PrecacheMessage, ws?: WebSocket) => {
    console.log('[Display] Received precache message:', {
      mediaCount: data.media.length,
      songCount: data.songs.length,
    })

    setIsCaching(true)
    setCacheProgress(t('live.display.cachingMedia', 'Caching media...'))

    try {
      // Cache songs first (fast, in-memory)
      if (data.songs.length > 0) {
        precacheSongs(data.songs)

        // Also update the local songCache for backward compatibility
        for (const songItem of data.songs) {
          const song: Song = {
            id: songItem.songId,
            churchId: data.churchId,
            title: songItem.title,
            content: songItem.lyrics,
            author: null,
            copyrightInfo: null,
            ccliNumber: null,
            arrangements: { default: [] },
            backgrounds: songItem.backgrounds,
            audienceBackgroundId: null,
            stageBackgroundId: null,
            lobbyBackgroundId: null,
            createdAt: songItem.updatedAt,
            updatedAt: songItem.updatedAt,
          }
          songCache.set(song.id, { song, updated_at: songItem.updatedAt })
        }
      }

      // Download and cache media (may take time)
      if (data.media.length > 0) {
        await precacheMedia(data.media, (statuses) => {
          const ready = statuses.filter(s => s.status === 'ready').length
          const total = statuses.length
          setCacheProgress(t('live.display.cachingProgress', { current: ready, total }))
        })

        // Update local mediaPathCache for backward compatibility
        for (const item of data.media) {
          const cachedUrl = getCachedMediaUrl(item.mediaId)
          if (cachedUrl) {
            mediaPathCache.set(item.mediaId, {
              filePath: cachedUrl,
              updatedAt: new Date().toISOString(),
              isColor: false,
            })
          }
        }
      }

      // Send acknowledgment back
      const ack: PrecacheAck = {
        eventId: data.eventId,
        ready: true,
        statuses: getAllStatuses(),
      }

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'precache_ack', data: ack }))
        console.log('[Display] Sent precache_ack')
      }

      setCacheProgress(t('live.display.cacheReady', 'Ready'))
      setIsWaiting(false)

    } catch (error) {
      console.error('[Display] Precache failed:', error)
      setCacheProgress(t('live.display.cacheError', 'Cache error'))
    } finally {
      setIsCaching(false)
      // Clear progress after a moment
      setTimeout(() => setCacheProgress(''), 2000)
    }
  }, [t])

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

        // Get local IP address for database update
        let localIp = '127.0.0.1'
        try {
          const ips = await invoke<string[]>('get_local_ip_addresses')
          // Prefer non-localhost IPs
          const nonLoopback = ips.filter(ip => !ip.startsWith('127.') && !ip.startsWith('::1'))
          if (nonLoopback.length > 0) {
            localIp = nonLoopback[0]
          }
          console.log('[Display] Local IP addresses:', ips, 'using:', localIp)
        } catch (e) {
          console.error('[Display] Failed to get local IP:', e)
        }

        // Update database with new port (so controllers can find us)
        try {
          await updateDisplayConnection(id, localIp, port)
          console.log('[Display] Updated database with host:', localIp, 'port:', port)
        } catch (e) {
          console.error('[Display] Failed to update display connection in database:', e)
          // Non-fatal - mDNS discovery can still work
        }

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
        wsConnectionRef.current = ws

        ws.onopen = () => {
          console.log('[Display] Connected to local WebSocket server')
        }

        ws.onmessage = (event) => {
          console.log('[Display] Received WebSocket message:', event.data.substring(0, 200))
          try {
            const message: WsMessage = JSON.parse(event.data)
            console.log('[Display] Parsed message type:', message.type)

            if (message.type === 'precache') {
              // Handle precache message - download and cache all media
              // Accept messages for any church since display is just a receiver
              console.log('[Display] Processing precache message')
              handlePrecache(message.data, ws!)
            } else if (message.type === 'lyrics') {
              // Cache the song data (accept from any church - display is just a receiver)
              console.log('[Display] Processing lyrics message for song:', message.data.song_id)
              const song: Song = {
                id: message.data.song_id,
                churchId: message.data.church_id,
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
                console.log('[Display] Cached song:', song.title, 'content length:', song.content?.length, 'preview:', song.content?.substring(0, 100))
              }

              // Load the first slide if not already showing
              if (!currentSlideRef.current) {
                console.log('[Display] Loading first slide for song')
                loadSlide(song.id, 0)
              }
            } else if (message.type === 'slide') {
              console.log('[Display] Processing slide message:', message.data.slide_index)
              loadSlide(message.data.song_id, message.data.slide_index)
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
    console.log('[Display] Song from cache:', { title: song.title, contentLength: song.content?.length })

    // Fix double-JSON-encoded content (if content starts with a quote, it's JSON-encoded)
    let content = song.content || ''
    console.log('[Display] Content first char:', content.charCodeAt(0), 'last char:', content.charCodeAt(content.length - 1))
    console.log('[Display] Content starts with quote?', content.startsWith('"'), 'ends with quote?', content.endsWith('"'))

    // Try to detect and fix JSON-encoded content
    // Check for escaped newlines which indicate JSON encoding
    if (content.includes('\\n') || (content.startsWith('"') && content.endsWith('"'))) {
      try {
        const parsed = JSON.parse(content)
        if (typeof parsed === 'string') {
          content = parsed
          console.log('[Display] Fixed double-encoded content')
        }
      } catch (e) {
        console.warn('[Display] Content might be JSON-encoded but failed to parse:', e)
      }
    }

    // Create a fixed song object for slide generation
    const fixedSong = { ...song, content }
    console.log('[Display] Song content preview:', content.substring(0, 100))

    const background = getSongBackground(fixedSong)
    const slides = generateSlides(fixedSong)
    console.log('[Display] Generated slides:', slides.length, 'slides')

    if (slides.length === 0) {
      console.warn('[Display] No slides generated from song content. Full content:', JSON.stringify(song.content))
      return
    }

    if (slideIndex >= 0 && slideIndex < slides.length) {
      console.log('[Display] Setting slide:', slideIndex, 'text:', slides[slideIndex]?.text?.substring(0, 50))
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
      ) : (
        /* Waiting screen with app branding */
        <div className="relative z-10 text-center space-y-8">
          {/* App title */}
          <div className="space-y-2">
            <h1 className="text-6xl font-bold text-white drop-shadow-2xl">
              {t('app.name', 'Mobile Worship')}
            </h1>
            <p className="text-xl text-white/60">
              {t('app.tagline', 'Worship presentation for everyone')}
            </p>
          </div>

          {/* Status message */}
          <div className="space-y-4">
            {isCaching ? (
              <>
                <div className="text-2xl font-medium text-white/80 drop-shadow-lg">
                  {cacheProgress || t('live.display.cachingMedia', 'Caching media...')}
                </div>
                <div className="flex items-center justify-center gap-3 text-white/60">
                  <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>{t('live.display.pleaseWait', 'Please wait...')}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-center gap-3 text-white/70">
                  <div className="w-3 h-3 rounded-full bg-white/50 animate-pulse" />
                  <span className="text-2xl">
                    {t('live.display.readyToReceive', 'Ready to receive presentations...')}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Hint for Android TV */}
          {isAndroid && (
            <div className="mt-12 text-white/40 text-sm">
              {t('live.display.pressOkForMenu', 'Press OK for menu')}
            </div>
          )}
        </div>
      )}

      {/* Android TV Menu Overlay */}
      {showMenu && isAndroid && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
          <div className="bg-slate-800 rounded-lg p-6 min-w-[300px] shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-4 text-center">
              {t('app.name', 'Mobile Worship')}
            </h2>
            <div className="space-y-2">
              {[
                { label: t('menu.resume', 'Resume'), icon: '▶' },
                { label: t('menu.about', 'About'), icon: 'ℹ' },
                { label: t('menu.exit', 'Exit'), icon: '✕' },
              ].map((item, idx) => (
                <button
                  key={idx}
                  className={`w-full px-4 py-3 rounded-lg text-left flex items-center gap-3 transition-colors ${
                    menuIndex === idx
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700/50 text-white/70 hover:bg-slate-700'
                  }`}
                  onClick={() => handleMenuAction(idx)}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-lg">{item.label}</span>
                </button>
              ))}
            </div>
            <p className="text-white/40 text-xs mt-4 text-center">
              {t('menu.navHint', 'Use Up/Down to navigate, OK to select, Back to close')}
            </p>
          </div>
        </div>
      )}

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
