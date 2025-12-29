import { useEffect, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useWebRTC } from '@/hooks/useWebRTC'
import { generateSlides } from '@/lib/slide-generator'
import type { Slide } from '@/types/live'
import type { Song } from '@/types/song'

interface DisplayMessage {
  type: 'song_data' | 'slide'
  eventId?: string
  itemId?: string
  slideIndex?: number
  // For song_data
  song?: Song & { updated_at: string }
  backgroundSignedUrls?: Record<string, string>  // key -> signed URL
}

// Check if we're running as a local display window (same Tauri process as controller)
// vs a remote display (separate device)
const isLocalDisplayWindow = (): boolean => {
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get('localMode') === 'true'
}

interface DisplayPageProps {
  eventId: string
  displayName?: string
}

// In-memory caches
const songCache = new Map<string, { song: Song; updated_at: string }>()
const mediaPathCache = new Map<string, { filePath: string; updatedAt: string; isColor: boolean }>()

// Tauri command to cache media from a fetched buffer
const cacheMediaFromBuffer = async (mediaId: string, updatedAt: string, buffer: ArrayBuffer): Promise<string> => {
  return invoke('cache_media_from_buffer', { mediaId, updatedAt, buffer: Array.from(new Uint8Array(buffer)) })
}

export function DisplayPage({ eventId, displayName = 'Display' }: DisplayPageProps) {
  const { t } = useTranslation()
  const { isConnected, connectionState, startPeer, peers } = useWebRTC()
  const localMode = isLocalDisplayWindow()

  const [currentSlide, setCurrentSlide] = useState<Slide | null>(null)
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null)
  const [backgroundColor, setBackgroundColor] = useState<string | null>(null)
  const [isWaiting, setIsWaiting] = useState(true)
  const [opacity, setOpacity] = useState(0)
  const [monitorInfo, setMonitorInfo] = useState<{ name: string; position: string } | null>(null)

  // Refs to track current song/slide for refresh when media arrives
  const currentSongIdRef = useRef<string | null>(null)
  const currentSlideIndexRef = useRef<number | null>(null)

  const currentSlideRef = useRef<Slide | null>(null)
  const backgroundUrlRef = useRef<string | null>(null)

  // Start WebRTC peer on mount (only for remote displays)
  useEffect(() => {
    if (localMode) {
      console.log('[Display] Running in local mode - using Tauri events instead of WebRTC')
      setIsWaiting(false)  // Local mode is always "ready"
      return
    }

    let mounted = true

    const initPeer = async () => {
      try {
        await startPeer('display', displayName)
      } catch (error) {
        console.error('Failed to start display peer:', error)
      }
    }

    if (mounted) {
      initPeer()
    }

    return () => {
      mounted = false
    }
  }, [displayName, startPeer, localMode])

  // Get background for a song
  const getSongBackground = useCallback((song: Song): { url?: string; color?: string } => {
    // Use backgrounds.default
    const mediaId = song.backgrounds?.default || undefined
    console.log('[Display] getSongBackground: mediaId =', mediaId, 'backgrounds:', song.backgrounds)
    if (!mediaId) {
      console.log('[Display] No media ID for background')
      return {}
    }

    const cached = mediaPathCache.get(mediaId)
    console.log('[Display] Cached media for', mediaId, ':', cached)
    if (!cached) {
      console.log('[Display] Media not in cache:', mediaId, 'Available:', Array.from(mediaPathCache.keys()))
      return {}
    }

    if (cached.isColor) {
      console.log('[Display] Using color background:', cached.filePath)
      return { color: cached.filePath }
    }
    // filePath now contains a data URL (for display windows)
    const url = cached.filePath
    console.log('[Display] Using image background (data URL):', url?.substring(0, 50) + '...')
    return { url }
  }, [])

  // Load slide from cached song data
  const loadSlide = useCallback((songId: string, slideIndex: number) => {
    console.log('[Display] Loading slide from cache:', { songId, slideIndex })

    // Track current song/slide for refresh when media arrives (use refs for immediate access)
    currentSongIdRef.current = songId
    currentSlideIndexRef.current = slideIndex

    const cached = songCache.get(songId)
    if (!cached) {
      console.warn('[Display] Song not in cache:', songId, 'Available:', Array.from(songCache.keys()))
      setIsWaiting(true)
      return
    }

    const { song } = cached
    console.log('[Display] Song loaded from cache:', song.title)

    // Get background for this song
    const background = getSongBackground(song)
    console.log('[Display] Background:', background)

    const slides = generateSlides(song)
    console.log('[Display] Generated slides:', slides.length)

    if (slideIndex >= 0 && slideIndex < slides.length) {
      const newSlide = slides[slideIndex]
      console.log('[Display] Showing slide:', newSlide)

      // Trigger crossfade
      setOpacity(0)

      setTimeout(() => {
        setCurrentSlide(newSlide)
        currentSlideRef.current = newSlide

        // Set background
        console.log('[Display] Setting background:', background)
        if (background.url) {
          console.log('[Display] Setting backgroundUrl to:', background.url)
          setBackgroundUrl(background.url)
          setBackgroundColor(null)
        } else if (background.color) {
          console.log('[Display] Setting backgroundColor to:', background.color)
          setBackgroundColor(background.color)
          setBackgroundUrl(null)
        } else {
          console.log('[Display] No background, clearing both')
          setBackgroundUrl(null)
          setBackgroundColor(null)
        }
        backgroundUrlRef.current = background.url || null

        // Fade in
        setOpacity(1)
      }, 300)
    } else {
      console.warn('[Display] Slide index out of bounds:', { slideIndex, slidesLength: slides.length })
    }
  }, [getSongBackground])

  // Fetch and cache media from a signed URL
  const fetchAndCacheMedia = useCallback(async (mediaId: string, signedUrl: string, updatedAt: string): Promise<void> => {
    // Check if already cached with same or newer version
    const cached = mediaPathCache.get(mediaId)
    if (cached && cached.updatedAt >= updatedAt) {
      console.log('[Display] Media already cached with same or newer version:', mediaId)
      return
    }

    console.log('[Display] Fetching media from URL:', mediaId, signedUrl)
    try {
      const response = await fetch(signedUrl)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const buffer = await response.arrayBuffer()
      console.log('[Display] Fetched', buffer.byteLength, 'bytes for', mediaId)

      // Cache to disk via Tauri
      const filePath = await cacheMediaFromBuffer(mediaId, updatedAt, buffer)

      // Get data URL for display windows (can't use asset:// protocol)
      const dataUrl = await invoke<string | null>('get_cached_media_data_url', { mediaId })
      if (dataUrl) {
        mediaPathCache.set(mediaId, {
          filePath: dataUrl,  // Store data URL instead of file path
          updatedAt,
          isColor: false,
        })
        console.log('[Display] Cached media and generated data URL:', mediaId)
      } else {
        console.warn('[Display] Failed to get data URL for:', mediaId)
        mediaPathCache.set(mediaId, {
          filePath: '',  // No data URL available
          updatedAt,
          isColor: false,
        })
      }

      // Refresh current slide if this is the background for the current song
      const currentSongId = currentSongIdRef.current
      if (currentSongId) {
        const song = songCache.get(currentSongId)?.song
        if (song?.backgrounds?.default === mediaId) {
          console.log('[Display] Refreshing slide with newly cached background')
          const background = getSongBackground(song)
          if (background.url) {
            setBackgroundUrl(background.url)
            setBackgroundColor(null)
          }
        }
      }
    } catch (error) {
      console.error('[Display] Failed to fetch/cache media:', mediaId, error)
    }
  }, [getSongBackground])

  // Listen for data messages (WebRTC or Tauri events)
  useEffect(() => {
    if (localMode) {
      // Local mode: listen for Tauri events from the controller
      console.log('[Display] Registering Tauri display:slide event handler (local mode)')

      const unlistenPromise = listen<{ songData?: { song: Song & { updated_at: string }, backgroundDataUrls?: Record<string, string> }, itemId?: string, slideIndex?: number }>(
        'display:slide',
        (event) => {
          console.log('[Display] Received local Tauri event:', event.payload)

          const { songData, itemId, slideIndex } = event.payload

          // Handle song data caching
          if (songData?.song) {
            const cached = songCache.get(songData.song.id)
            if (!cached || cached.updated_at < songData.song.updated_at) {
              console.log('[Display] Caching song:', songData.song.title)
              songCache.set(songData.song.id, { song: songData.song, updated_at: songData.song.updated_at })

              // Store background data URLs directly (already base64 encoded from controller)
              if (songData.backgroundDataUrls) {
                for (const [key, dataUrl] of Object.entries(songData.backgroundDataUrls)) {
                  const mediaId = songData.song.backgrounds?.[key]
                  if (mediaId && dataUrl) {
                    // Store data URL directly in mediaPathCache
                    mediaPathCache.set(mediaId, {
                      filePath: dataUrl,  // data URL can be used directly
                      updatedAt: songData.song.updatedAt,
                      isColor: false,
                    })
                    console.log('[Display] Stored background data URL for:', key)
                  }
                }
              }
            }
          }

          // Handle slide display
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
      // Remote mode: listen for WebRTC events
      console.log('[Display] Registering webrtc:data_received handler (remote mode)')
      type DataReceivedEvent = {
        from_peer_id: string
        message: string
      }

      const handleMessage = async (event: Event) => {
        const customEvent = event as CustomEvent<DataReceivedEvent>
        console.log('[Display] Received message from', customEvent.detail.from_peer_id, ':', customEvent.detail.message)

        try {
          const msg: DisplayMessage = JSON.parse(customEvent.detail.message)
          console.log('[Display] Parsed message type:', msg.type)

          if (msg.type === 'song_data' && msg.song) {
            // Cache song data with version tracking
            const cached = songCache.get(msg.song.id)
            if (!cached || cached.updated_at < msg.song.updated_at) {
              console.log('[Display] Caching song:', msg.song.title, 'updated:', msg.song.updated_at)
              console.log('[Display] Song backgrounds:', msg.song.backgrounds)
              songCache.set(msg.song.id, { song: msg.song, updated_at: msg.song.updated_at })

              // Fetch and cache background media from signed URLs
              if (msg.backgroundSignedUrls) {
                for (const [key, signedUrl] of Object.entries(msg.backgroundSignedUrls)) {
                  const mediaId = msg.song.backgrounds?.[key]
                  if (mediaId && signedUrl) {
                    console.log('[Display] Fetching', key, 'background media:', mediaId)
                    // Fetch in background, don't wait
                    fetchAndCacheMedia(mediaId, signedUrl, msg.song.updatedAt)
                  }
                }
              }
            } else {
              console.log('[Display] Song already cached with same or newer version')
            }
          } else if (msg.type === 'slide' && msg.itemId && msg.slideIndex !== undefined) {
            loadSlide(msg.itemId, msg.slideIndex)
            setIsWaiting(false)
          }
        } catch (e) {
          console.error('[Display] Failed to parse message:', e)
        }
      }

      window.addEventListener('webrtc:data_received', handleMessage)
      return () => {
        window.removeEventListener('webrtc:data_received', handleMessage)
      }
    }
  }, [eventId, loadSlide, localMode])

  // Count connected controllers
  const connectedCount = peers.filter(p => p.is_connected && p.peer_type === 'controller').length

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
              {monitorInfo && (
                <span className="ml-3 text-white/40">
                  ({monitorInfo.position})
                </span>
              )}
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
              console.log('[Display] Test: calling test_emit_event');
              try {
                await invoke('test_emit_event', { message: 'Hello from Display!' });
                console.log('[Display] Test: emit called successfully');
              } catch (e) {
                console.error('[Display] Test: emit failed', e);
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
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            isConnected
              ? 'bg-green-500/90 text-white'
              : connectionState === 'discovering'
              ? 'bg-yellow-500/90 text-white'
              : 'bg-red-500/90 text-white'
          }`}
        >
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-white' : 'bg-white/60'
            }`}
          />
          <span>
            {isConnected
              ? t('live.display.connected', 'Connected ({{count}})', { count: connectedCount })
              : connectionState === 'discovering'
              ? t('live.display.connecting', 'Connecting...')
              : t('live.display.disconnected', 'Disconnected')}
          </span>
        </div>
      </div>
    </div>
  )
}
