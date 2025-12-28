import { useEffect, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useWebRTC } from '@/hooks/useWebRTC'
import { generateSlides } from '@/lib/slide-generator'
import { getSong } from '@/services/songs'
import type { Slide, BroadcastMessage } from '@/types/live'

interface DisplayPageProps {
  eventId: string
  displayName?: string
}

export function DisplayPage({ eventId, displayName = 'Display' }: DisplayPageProps) {
  const { t } = useTranslation()
  const { isConnected, connectionState, startPeer, peers } = useWebRTC()

  const [currentSlide, setCurrentSlide] = useState<Slide | null>(null)
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null)
  const [isWaiting, setIsWaiting] = useState(true)
  const [opacity, setOpacity] = useState(0)

  const currentSlideRef = useRef<Slide | null>(null)
  const backgroundUrlRef = useRef<string | null>(null)

  // Start WebRTC peer on mount
  useEffect(() => {
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
  }, [displayName, startPeer])

  // Listen for WebRTC data messages
  useEffect(() => {
    type DataReceivedEvent = {
      from_peer_id: string
      message: string
    }

    const handleMessage = (event: CustomEvent<DataReceivedEvent>) => {
      try {
        const msg: BroadcastMessage = JSON.parse(event.detail.message)
        if (msg.type === 'slide' && msg.eventId === eventId) {
          loadSlide(msg.itemId, msg.slideIndex)
          setIsWaiting(false)
        }
      } catch (e) {
        console.error('Failed to parse message:', e)
      }
    }

    window.addEventListener('webrtc:data_received', handleMessage as EventListener)
    return () => {
      window.removeEventListener('webrtc:data_received', handleMessage as EventListener)
    }
  }, [eventId])

  const loadSlide = useCallback(async (songId: string, slideIndex: number) => {
    try {
      const song = await getSong(songId)
      if (!song) {
        console.warn('Song not found:', songId)
        return
      }

      const slides = generateSlides(song)
      if (slideIndex >= 0 && slideIndex < slides.length) {
        const newSlide = slides[slideIndex]

        // Trigger crossfade
        setOpacity(0)

        setTimeout(() => {
          setCurrentSlide(newSlide)
          currentSlideRef.current = newSlide

          // TODO: Load background from Supabase storage
          // For now, use fallback gradient
          setBackgroundUrl(null)
          backgroundUrlRef.current = null

          // Fade in
          setOpacity(1)
        }, 300)
      }
    } catch (error) {
      console.error('Failed to load slide:', error)
    }
  }, [])

  // Count connected controllers
  const connectedCount = peers.filter(p => p.is_connected && p.peer_type === 'controller').length

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
      {/* Background */}
      {backgroundUrl ? (
        <img src={backgroundUrl} alt="" className="absolute inset-0 object-cover" />
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
        <div className="relative z-10 text-center">
          <div className="text-3xl font-semibold text-white/80 drop-shadow-lg">
            {t('live.display.waitingForController', 'Waiting for controller...')}
          </div>
        </div>
      ) : null}

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
