import { createContext, useContext, useRef, useState, useCallback, useEffect, type ReactNode } from 'react'
import { isTauri, safeInvoke } from '@/lib/tauri'
import type { DiscoveredDisplay } from '@/types/display'
import type { PrecacheMessage, PrecacheAck } from '@/types/live'

interface ConnectedDisplay {
  key: string // host:port
  name: string
  host: string
  port: number
}

interface LyricsMessage {
  church_id: string
  event_id: string
  song_id: string
  title: string
  lyrics: string
  background_url?: string
  timestamp: number
}

interface SlideMessage {
  church_id: string
  event_id: string
  song_id: string
  slide_index: number
  timestamp: number
}

interface WebSocketContextValue {
  discovered: DiscoveredDisplay[]
  connected: Map<string, ConnectedDisplay>
  isDiscovering: boolean
  precacheAcks: Map<string, PrecacheAck> // key = displayKey
  discover: () => Promise<void>
  connect: (display: DiscoveredDisplay | { host: string; port: number; name: string }) => void
  disconnect: (key: string) => void
  broadcastLyrics: (message: LyricsMessage) => void
  broadcastSlide: (message: SlideMessage) => void
  broadcastPrecache: (message: PrecacheMessage) => void
  clearPrecacheAcks: () => void
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null)

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [discovered, setDiscovered] = useState<DiscoveredDisplay[]>([])
  const [connected, setConnected] = useState<Map<string, ConnectedDisplay>>(new Map())
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [precacheAcks, setPrecacheAcks] = useState<Map<string, PrecacheAck>>(new Map())
  const wsRef = useRef<Map<string, WebSocket>>(new Map())
  const discoveredRef = useRef<DiscoveredDisplay[]>([])

  const discover = useCallback(async () => {
    // Skip discovery if we're on the display route
    const isDisplayRoute = window.location.pathname.startsWith('/live/display')
    if (isDisplayRoute) {
      console.log('[WebSocketContext] Display route detected, skipping discovery')
      return
    }

    // Skip mDNS discovery in web - browsers can't do multicast DNS
    // Web users will use the Displays page which queries Supabase directly
    if (!isTauri()) {
      return
    }

    setIsDiscovering(true)
    try {
      const found = await safeInvoke<DiscoveredDisplay[]>('discover_display_devices', { timeoutSecs: 5 })
      if (!found) {
        setIsDiscovering(false)
        return
      }

      // Deduplicate by name (same device might be returned for multiple IP addresses)
      const uniqueDevices = new Map<string, DiscoveredDisplay>()
      for (const device of found) {
        // Use name as the unique key since each display has a unique name
        // Prefer non-loopback addresses (192.168.x.x or 100.96.x.x over 127.x.x.x)
        const existing = uniqueDevices.get(device.name)
        if (!existing) {
          uniqueDevices.set(device.name, device)
        } else {
          // Prefer non-loopback addresses
          const existingIsLoopback = existing.host.startsWith('127.')
          const newIsLoopback = device.host.startsWith('127.')
          if (existingIsLoopback && !newIsLoopback) {
            uniqueDevices.set(device.name, device)
          }
        }
      }

      const deduplicated = Array.from(uniqueDevices.values())

      // Only update if we found new devices
      if (deduplicated.length > 0) {
        setDiscovered(deduplicated)
        discoveredRef.current = deduplicated
        console.log('[WebSocketContext] Discovered:', deduplicated.length, 'unique devices')
      } else {
        console.log('[WebSocketContext] No new devices found, keeping', discoveredRef.current.length, 'existing')
      }
    } catch (e) {
      console.error('[WebSocketContext] Discovery failed:', e)
    } finally {
      setIsDiscovering(false)
    }
  }, [])

  const connect = useCallback((display: DiscoveredDisplay | { host: string; port: number; name: string }) => {
    const key = `${display.host}:${display.port}`

    if (wsRef.current.has(key)) {
      console.log('[WebSocketContext] Already connected to', key)
      return
    }

    console.log('[WebSocketContext] Connecting to', key)
    const ws = new WebSocket(`ws://${display.host}:${display.port}`)

    ws.onopen = () => {
      console.log('[WebSocketContext] Connected to', display.name)
      setConnected(prev => new Map(prev).set(key, { key, name: display.name, host: display.host, port: display.port }))
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'precache_ack') {
          console.log('[WebSocketContext] Received precache_ack from', display.name)
          setPrecacheAcks(prev => new Map(prev).set(key, message.data as PrecacheAck))
        }
      } catch (e) {
        console.error('[WebSocketContext] Failed to parse message:', e)
      }
    }

    ws.onerror = (error) => {
      console.error('[WebSocketContext] WebSocket error for', display.name, error)
    }

    ws.onclose = () => {
      console.log('[WebSocketContext] Disconnected from', display.name)
      setConnected(prev => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
      wsRef.current.delete(key)
    }

    wsRef.current.set(key, ws)
  }, [])

  const disconnect = useCallback((key: string) => {
    const ws = wsRef.current.get(key)
    if (ws) {
      ws.close()
      wsRef.current.delete(key)
      setConnected(prev => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
    }
  }, [])

  const broadcastLyrics = useCallback((message: LyricsMessage) => {
    const payload = { type: 'lyrics', data: message }
    const json = JSON.stringify(payload)

    wsRef.current.forEach((ws, key) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json)
      } else {
        console.warn(`[WebSocketContext] Cannot send to ${key}: not ready`)
      }
    })

    console.log(`[WebSocketContext] Broadcast lyrics to ${wsRef.current.size} connections`)
  }, [])

  const broadcastSlide = useCallback((message: SlideMessage) => {
    const payload = { type: 'slide', data: message }
    const json = JSON.stringify(payload)

    wsRef.current.forEach((ws, key) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json)
      } else {
        console.warn(`[WebSocketContext] Cannot send to ${key}: not ready`)
      }
    })

    console.log(`[WebSocketContext] Broadcast slide to ${wsRef.current.size} connections`)
  }, [])

  const broadcastPrecache = useCallback((message: PrecacheMessage) => {
    const payload = { type: 'precache', data: message }
    const json = JSON.stringify(payload)

    // Clear previous acks before sending new precache
    setPrecacheAcks(new Map())

    wsRef.current.forEach((ws, key) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json)
      } else {
        console.warn(`[WebSocketContext] Cannot send to ${key}: not ready`)
      }
    })

    console.log(`[WebSocketContext] Broadcast precache to ${wsRef.current.size} connections`)
  }, [])

  const clearPrecacheAcks = useCallback(() => {
    setPrecacheAcks(new Map())
  }, [])

  // Auto-discover on mount (but NOT in display mode - displays advertise, controllers discover)
  useEffect(() => {
    // Skip entirely if on display route - no need for discovery or polling
    const isDisplayRoute = window.location.pathname.startsWith('/live/display')
    if (isDisplayRoute) {
      return
    }

    discover()
    const interval = setInterval(discover, 10000)
    return () => clearInterval(interval)
  }, [discover])

  const value: WebSocketContextValue = {
    discovered,
    connected,
    isDiscovering,
    precacheAcks,
    discover,
    connect,
    disconnect,
    broadcastLyrics,
    broadcastSlide,
    broadcastPrecache,
    clearPrecacheAcks,
  }

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>
}

export function useWebSocketConnections() {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error('useWebSocketConnections must be used within WebSocketProvider')
  }
  return context
}
