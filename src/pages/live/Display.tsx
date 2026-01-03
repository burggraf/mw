import { useEffect, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useChurch } from '@/contexts/ChurchContext'
import { generateSlides } from '@/lib/slide-generator'
import { isTauri, safeInvoke } from '@/lib/tauri'
import type { Slide, PrecacheMessage, PrecacheAck } from '@/types/live'
import type { Song } from '@/types/song'
import {
  precacheMedia,
  precacheSongs,
  getCachedMediaUrl,
  getAllStatuses,
} from '@/services/media-cache'
import { updateDisplayConnection, updateDisplayHeartbeat } from '@/services/displays'

type WsMessage =
  | { type: 'lyrics'; data: { target_display_id?: string; church_id: string; event_id: string; song_id: string; title: string; lyrics: string; background_url?: string; timestamp: number } }
  | { type: 'slide'; data: { target_display_id?: string; church_id: string; event_id: string; song_id: string; slide_index: number; timestamp: number } }
  | { type: 'media'; data: { target_display_id?: string; church_id: string; event_id: string; media_url: string; media_type: 'image' | 'video'; timestamp: number } }
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

// Get displayId from URL params (set when display window is opened)
const getDisplayIdFromUrl = (): string | null => {
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get('displayId')
}

export function DisplayPage({ eventId }: DisplayPageProps) {
  const { t } = useTranslation()
  const { currentChurch } = useChurch()
  const localMode = isLocalDisplayWindow()

  // Get display ID from URL - this identifies which display this window represents
  const displayIdRef = useRef<string | null>(getDisplayIdFromUrl())
  console.log('[Display] Display ID from URL:', displayIdRef.current)

  // Check if a message is targeted at this display
  // Returns true if message should be processed (broadcast or targeted to us)
  const isMessageForThisDisplay = useCallback((targetDisplayId: string | undefined | null): boolean => {
    // If no target specified, it's a broadcast - process it
    if (!targetDisplayId) {
      return true
    }
    // If we don't have a display ID, accept all messages (legacy behavior)
    if (!displayIdRef.current) {
      return true
    }
    // Check if the target matches our display ID
    return targetDisplayId === displayIdRef.current
  }, [])

  const [currentSlide, setCurrentSlide] = useState<Slide | null>(null)
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null)
  const [backgroundColor, setBackgroundColor] = useState<string | null>(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null)
  // @ts-expect-error - isWaiting is used indirectly via setIsWaiting
  const [isWaiting, setIsWaiting] = useState(true)
  const [opacity, setOpacity] = useState(0)
  const [isCaching, setIsCaching] = useState(false)
  const [cacheProgress, setCacheProgress] = useState<string>('')
  const [showMenu, setShowMenu] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [menuIndex, setMenuIndex] = useState(0)
  const [isAndroid, setIsAndroid] = useState(false)
  const [activeDisplayId, setActiveDisplayId] = useState<string | null>(null)

  // Refs to track current song/slide for refresh when media arrives
  const currentSongIdRef = useRef<string | null>(null)
  const currentSlideIndexRef = useRef<number | null>(null)
  const currentSlideRef = useRef<Slide | null>(null)
  const backgroundUrlRef = useRef<string | null>(null)
  const serverPortRef = useRef<number | null>(null)
  const isInitializingRef = useRef<boolean>(false)
  const wsConnectionRef = useRef<WebSocket | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const aboutContentRef = useRef<HTMLDivElement>(null)
  const showMenuRef = useRef(false)
  const showAboutRef = useRef(false)
  const menuIndexRef = useRef(0)
  const heartbeatIntervalRef = useRef<number | null>(null)

  // Keep the refs in sync with state
  useEffect(() => {
    showMenuRef.current = showMenu
  }, [showMenu])

  useEffect(() => {
    showAboutRef.current = showAbout
  }, [showAbout])

  useEffect(() => {
    menuIndexRef.current = menuIndex
  }, [menuIndex])

  // Detect Android platform on mount
  useEffect(() => {
    const checkPlatform = async () => {
      try {
        const platform = await safeInvoke<string>('get_platform')
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

  // Auto-focus the main container on mount so d-pad works immediately
  // On Android TV, we need to be very aggressive about focus management
  useEffect(() => {
    const focusContainer = () => {
      if (containerRef.current && document.activeElement !== containerRef.current) {
        console.log('[Display] Focusing main container for d-pad support')
        containerRef.current.focus()
      }
    }

    // Focus immediately
    focusContainer()

    // Multiple delayed attempts for Android TV (WebView may steal focus during init)
    const delays = [100, 300, 500, 1000, 2000]
    const timeoutIds = delays.map(delay => setTimeout(focusContainer, delay))

    // Also re-focus whenever the window gains focus
    const handleWindowFocus = () => {
      console.log('[Display] Window focused, ensuring container focus')
      focusContainer()
    }
    window.addEventListener('focus', handleWindowFocus)

    // Re-focus on any key event if not already focused (catches first d-pad press)
    const handleAnyKey = () => {
      if (document.activeElement !== containerRef.current) {
        focusContainer()
      }
    }
    window.addEventListener('keydown', handleAnyKey, { capture: true, once: false })

    return () => {
      timeoutIds.forEach(id => clearTimeout(id))
      window.removeEventListener('focus', handleWindowFocus)
      window.removeEventListener('keydown', handleAnyKey, { capture: true })
    }
  }, [])

  // Menu action handler
  const handleMenuAction = async (index: number) => {
    switch (index) {
      case 0: // Resume
        setShowMenu(false)
        break
      case 1: // About
        setShowMenu(false)
        setShowAbout(true)
        break
      case 2: // Exit
        try {
          // Use native Android exit if available (via JavaScript interface)
          const androidApp = (window as any).AndroidApp
          if (androidApp?.exitApp) {
            androidApp.exitApp()
          } else if (isTauri()) {
            // Fallback to Tauri exit
            const { exit } = await import('@tauri-apps/plugin-process')
            await exit(0)
          } else {
            window.close()
          }
        } catch (e) {
          console.error('[Display] Failed to exit:', e)
          window.close()
        }
        break
    }
  }

  // D-pad navigation for Android TV menu (up/down/back only)
  useEffect(() => {
    // Always enable for all platforms - d-pad codes are specific
    const handleKeyDown = (e: KeyboardEvent) => {
      const isEnterKey = (
        e.key === 'Enter' ||
        e.keyCode === 13 ||
        e.keyCode === 23 || // Android DPAD_CENTER
        e.code === 'Enter' ||
        e.code === 'NumpadEnter'
      )

      const isBackKey = (
        e.key === 'Escape' ||
        e.key === 'Back' ||
        e.keyCode === 27 ||
        e.keyCode === 4 // Android KEYCODE_BACK
      )

      // If About dialog is open, handle scrolling and close
      if (showAboutRef.current) {
        if (isEnterKey || isBackKey) {
          setShowAbout(false)
          e.preventDefault()
          e.stopPropagation()
          return
        }

        // Handle scrolling with arrow keys
        const scrollAmount = 60 // pixels to scroll per keypress
        if (
          e.key === 'ArrowUp' ||
          e.keyCode === 38 ||
          e.keyCode === 19 // DPAD_UP
        ) {
          aboutContentRef.current?.scrollBy({ top: -scrollAmount, behavior: 'smooth' })
          e.preventDefault()
          e.stopPropagation()
        } else if (
          e.key === 'ArrowDown' ||
          e.keyCode === 40 ||
          e.keyCode === 20 // DPAD_DOWN
        ) {
          aboutContentRef.current?.scrollBy({ top: scrollAmount, behavior: 'smooth' })
          e.preventDefault()
          e.stopPropagation()
        }
        return
      }

      // If menu is open, handle menu navigation
      if (showMenuRef.current) {
        if (isEnterKey) {
          // Select current menu item
          handleMenuAction(menuIndexRef.current)
          e.preventDefault()
          e.stopPropagation()
          return
        }

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
        // Back button closes menu
        else if (isBackKey) {
          setShowMenu(false)
          e.preventDefault()
          e.stopPropagation()
        }
        return
      }

      // Menu not open - Enter opens it
      if (isEnterKey) {
        setShowMenu(true)
        setMenuIndex(0)
        e.preventDefault()
        e.stopPropagation()
      }
    }

    // Listen on both window and document to catch events from:
    // - Native Android key forwarding (dispatches to document)
    // - Regular browser key events (bubble to window)
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    document.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
      document.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, []) // Run once on mount - uses refs for current state values

  // Send periodic heartbeats to keep display marked as online
  useEffect(() => {
    // Only send heartbeats in remote mode (not local display windows)
    if (localMode) return

    // Wait until displayId is available
    if (!activeDisplayId) return

    const sendHeartbeat = async () => {
      try {
        await updateDisplayHeartbeat(activeDisplayId)
        console.log('[Display] Heartbeat sent for display:', activeDisplayId)
      } catch (error) {
        console.error('[Display] Heartbeat failed:', error)
      }
    }

    // Send initial heartbeat
    sendHeartbeat()

    // Send heartbeat every 10 seconds
    heartbeatIntervalRef.current = window.setInterval(sendHeartbeat, 10000)

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
        heartbeatIntervalRef.current = null
      }
    }
  }, [localMode, activeDisplayId])

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
    const hasTauri = isTauri()
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
        const deviceId = await safeInvoke<string>('get_device_id')
        if (!deviceId) {
          console.error('[Display] Failed to get device ID')
          return
        }
        console.log('[Display] Got device ID:', deviceId)

        // Get display ID from URL (set when display window was opened)
        // Falls back to device ID for backward compatibility with single-display devices
        const displayId = displayIdRef.current || deviceId
        console.log('[Display] Using display ID:', displayId)

        // Set active display ID to trigger heartbeat
        setActiveDisplayId(displayId)

        // Start the WebSocket server
        const port = await safeInvoke<number>('start_websocket_server')
        if (!port) {
          console.error('[Display] Failed to start WebSocket server')
          return
        }
        serverPortRef.current = port
        console.log('[Display] WebSocket server started on port', port)

        // Get local IP address for database update
        let localIp = '127.0.0.1'
        try {
          const ips = await safeInvoke<string[]>('get_local_ip_addresses')
          if (ips) {
            // Prefer non-localhost IPs
            const nonLoopback = ips.filter(ip => !ip.startsWith('127.') && !ip.startsWith('::1'))
            if (nonLoopback.length > 0) {
              localIp = nonLoopback[0]
            }
            console.log('[Display] Local IP addresses:', ips, 'using:', localIp)
          }
        } catch (e) {
          console.error('[Display] Failed to get local IP:', e)
        }

        // Update database with new port (so controllers can find us)
        // Uses display_id as the unique key now
        try {
          await updateDisplayConnection(displayId, localIp, port)
          console.log('[Display] Updated database with display_id:', displayId, 'host:', localIp, 'port:', port)
        } catch (e) {
          console.error('[Display] Failed to update display connection in database:', e)
          // Non-fatal - mDNS discovery can still work
        }

        // Also advertise via mDNS with per-display information
        const displayName = `${currentChurch?.name || 'Mobile Worship'} Display`
        // Get screen dimensions for discovery info
        const screenWidth = window.screen.width * (window.devicePixelRatio || 1)
        const screenHeight = window.screen.height * (window.devicePixelRatio || 1)
        // Extract platform info from user agent
        const ua = navigator.userAgent
        let platformInfo = navigator.platform || 'Unknown'
        if (ua.includes('Android')) {
          const match = ua.match(/Android\s+([\d.]+)/)
          platformInfo = match ? `Android ${match[1]}` : 'Android'
          // Check for Fire OS (Amazon devices)
          if (ua.includes('AFTN') || ua.includes('AFTM') || ua.includes('AFTS') || ua.includes('AFTT') || ua.includes('AFTKRT')) {
            platformInfo = `Fire OS (${platformInfo})`
          }
        } else if (ua.includes('iPhone') || ua.includes('iPad')) {
          const match = ua.match(/OS\s+([\d_]+)/)
          platformInfo = match ? `iOS ${match[1].replace(/_/g, '.')}` : 'iOS'
        } else if (ua.includes('Mac OS')) {
          platformInfo = 'macOS'
        } else if (ua.includes('Windows')) {
          platformInfo = 'Windows'
        } else if (ua.includes('Linux')) {
          platformInfo = 'Linux'
        }
        try {
          await safeInvoke('start_advertising', {
            name: displayName,
            port,
            displayId,
            deviceId,
            displayName,
            width: Math.round(screenWidth),
            height: Math.round(screenHeight),
            platform: platformInfo,
          })
          console.log('[Display] Advertising as', displayName, 'with display_id:', displayId, 'device_id:', deviceId, 'resolution:', screenWidth, 'x', screenHeight, 'platform:', platformInfo)
        } catch (e) {
          console.error('[Display] mDNS advertising failed:', e)
        }

        // Start UDP listener for broadcast discovery fallback
        // This allows discovery on networks where mDNS is blocked
        try {
          await safeInvoke('start_udp_listener', { port: 48488, wsPort: port })
          console.log('[Display] UDP listener started on port 48488')
        } catch (e) {
          console.error('[Display] UDP listener failed:', e)
        }

        setIsWaiting(false)

        // Mark this run as completed successfully
        thisRunCompleted = true

        // Connect to our own server to receive messages
        // Use 127.0.0.1 instead of localhost to avoid IPv6 resolution issues on Android
        ws = new WebSocket(`ws://127.0.0.1:${port}`)
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
              // Check if this message is targeted at this display
              if (!isMessageForThisDisplay(message.data.target_display_id)) {
                console.log('[Display] Ignoring lyrics message - target_display_id:', message.data.target_display_id, 'our ID:', displayIdRef.current)
                return
              }
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
              // Check if this message is targeted at this display
              if (!isMessageForThisDisplay(message.data.target_display_id)) {
                console.log('[Display] Ignoring slide message - target_display_id:', message.data.target_display_id, 'our ID:', displayIdRef.current)
                return
              }
              console.log('[Display] Processing slide message:', message.data.slide_index)
              loadSlide(message.data.song_id, message.data.slide_index)
            } else if (message.type === 'media') {
              // Check if this message is targeted at this display
              if (!isMessageForThisDisplay(message.data.target_display_id)) {
                console.log('[Display] Ignoring media message - target_display_id:', message.data.target_display_id, 'our ID:', displayIdRef.current)
                return
              }
              console.log('[Display] Processing media message:', message.data.media_type)
              // Clear song slide and show media
              setCurrentSlide(null)
              setOpacity(0)
              setTimeout(() => {
                setMediaUrl(message.data.media_url)
                setMediaType(message.data.media_type)
                setOpacity(1)
                setIsWaiting(false)
              }, 300)
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

    // Clear media when showing song slide
    setMediaUrl(null)
    setMediaType(null)

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
    if (localMode && isTauri()) {
      console.log('[Display] Registering Tauri display:slide and display:media event handlers (local mode)')

      let unlistenSlideFn: (() => void) | null = null
      let unlistenMediaFn: (() => void) | null = null

      import('@tauri-apps/api/event').then(({ listen }) => {
        // Listen for slide events (songs)
        listen<{ songData?: { song: Song & { updated_at: string }, backgroundDataUrls?: Record<string, string> }, itemId?: string, slideIndex?: number }>(
          'display:slide',
          (event) => {
            console.log('[Display] Received local Tauri slide event:', event.payload)

            const { songData, itemId, slideIndex } = event.payload

            // Clear media when showing song
            setMediaUrl(null)
            setMediaType(null)

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
        ).then(unlisten => {
          unlistenSlideFn = unlisten
        })

        // Listen for media events (slides/folders)
        listen<{ mediaUrl: string, mediaType: 'image' | 'video' }>(
          'display:media',
          (event) => {
            console.log('[Display] Received local Tauri media event:', event.payload)

            const { mediaUrl: url, mediaType: type } = event.payload

            // Clear song slide and show media
            setCurrentSlide(null)
            setOpacity(0)
            setTimeout(() => {
              setMediaUrl(url)
              setMediaType(type)
              setOpacity(1)
              setIsWaiting(false)
            }, 300)
          }
        ).then(unlisten => {
          unlistenMediaFn = unlisten
        })
      })

      return () => {
        unlistenSlideFn?.()
        unlistenMediaFn?.()
      }
    } else {
      // Remote mode - WebSocket listening handled in the initialization useEffect above
      return () => {}
    }
  }, [eventId, loadSlide, localMode])

  // Click handler to restore focus (useful on Android TV if focus is lost)
  const handleContainerClick = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.focus()
    }
  }, [])

  // Re-focus immediately when focus is lost (aggressive focus retention for Android TV)
  const handleContainerBlur = useCallback(() => {
    // Use setTimeout to allow the blur to complete, then refocus
    // unless a dialog is open (menu or about)
    setTimeout(() => {
      if (containerRef.current && !showMenuRef.current && !showAboutRef.current) {
        console.log('[Display] Container lost focus, refocusing')
        containerRef.current.focus()
      }
    }, 0)
  }, [])

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      autoFocus
      className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden"
      style={{ outline: 'none' }}
      onClick={handleContainerClick}
      onBlur={handleContainerBlur}
    >
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
      ) : mediaUrl ? (
        /* Media display (slides/folders) - black background ensures clean transitions */
        <div
          className="absolute inset-0 bg-black flex items-center justify-center transition-opacity duration-300"
          style={{ opacity }}
        >
          {mediaType === 'video' ? (
            <video
              src={mediaUrl}
              autoPlay
              loop
              muted
              className="w-full h-full object-contain"
            />
          ) : (
            <img
              src={mediaUrl}
              alt=""
              className="w-full h-full object-contain"
            />
          )}
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
                { label: t('menu.about', 'About'), icon: 'ⓘ' },
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

      {/* About Dialog */}
      {showAbout && isAndroid && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-8">
          <div className="bg-slate-800 rounded-lg p-6 max-w-lg w-full max-h-[80vh] shadow-2xl flex flex-col">
            <h2 className="text-2xl font-bold text-white mb-2 text-center flex items-center justify-center gap-2">
              <span className="text-3xl">ⓘ</span>
              {t('app.name', 'Mobile Worship')}
            </h2>
            <p className="text-white/60 text-center mb-4">
              {t('app.tagline', 'Worship presentation for everyone')}
            </p>
            <div ref={aboutContentRef} className="overflow-y-auto flex-1 space-y-4 text-white/80 pr-2">
              <div>
                <h3 className="text-lg font-semibold text-white mb-1">
                  {t('about.whatIs', 'What is Mobile Worship?')}
                </h3>
                <p className="text-sm">
                  {t('about.description', 'Mobile Worship is a modern, decentralized worship presentation platform. Control presentations from your phone or tablet while displaying on affordable devices like Amazon Fire TV.')}
                </p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-1">
                  {t('about.features', 'Features')}
                </h3>
                <ul className="text-sm space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400">•</span>
                    <span>{t('about.feature1', 'Display song lyrics with beautiful backgrounds')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400">•</span>
                    <span>{t('about.feature2', 'Control from any phone, tablet, or computer')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400">•</span>
                    <span>{t('about.feature3', 'Works on affordable streaming devices')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400">•</span>
                    <span>{t('about.feature4', 'No expensive hardware required')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400">•</span>
                    <span>{t('about.feature5', 'Automatic device discovery on your network')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400">•</span>
                    <span>{t('about.feature6', 'Supports multiple displays')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400">•</span>
                    <span>{t('about.feature7', 'Organize songs into setlists for services')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400">•</span>
                    <span>{t('about.feature8', 'Works offline after initial setup')}</span>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-1">
                  {t('about.howToUse', 'How to Use')}
                </h3>
                <p className="text-sm">
                  {t('about.howToUseText', 'This display is waiting for a controller to connect. Open Mobile Worship on your phone or computer, select this display, and start presenting!')}
                </p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-700">
              <p className="text-white/40 text-xs text-center">
                {t('about.pressToClose', 'Press OK or Back to close this dialog')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
