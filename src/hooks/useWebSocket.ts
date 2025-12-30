import { useEffect, useRef, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface DisplayDevice {
  name: string
  host: string
  port: number
  service_type: string
}

export interface LyricsMessage {
  church_id: string
  event_id: string
  song_id: string
  title: string
  lyrics: string
  background_url?: string
  timestamp: number
}

export interface SlideMessage {
  church_id: string
  event_id: string
  song_id: string
  slide_index: number
  timestamp: number
}

type WsMessage =
  | { type: 'lyrics'; data: LyricsMessage }
  | { type: 'slide'; data: SlideMessage }
  | { type: 'ping' }

export function useWebSocket() {
  const [devices, setDevices] = useState<DisplayDevice[]>([])
  const [connections, setConnections] = useState<Map<string, WebSocket>>(new Map())
  const [isServerRunning, setIsServerRunning] = useState(false)
  const [serverPort, setServerPort] = useState<number | null>(null)
  const connectionsRef = useRef(connections)

  // Keep ref in sync
  useEffect(() => {
    connectionsRef.current = connections
  }, [connections])

  // Start WebSocket server (for displays)
  const startServer = useCallback(async () => {
    try {
      const port = await invoke<number>('start_websocket_server')
      setServerPort(port)
      setIsServerRunning(true)
      return port
    } catch (e) {
      console.error('Failed to start WebSocket server:', e)
      throw e
    }
  }, [])

  // Discover devices via mDNS
  const discoverDevices = useCallback(async (timeout = 5) => {
    try {
      const found = await invoke<DisplayDevice[]>('discover_display_devices', { timeoutSecs: timeout })
      setDevices(found)
      return found
    } catch (e) {
      console.error('Failed to discover devices:', e)
      return []
    }
  }, [])

  // Connect to a display device
  const connectToDevice = useCallback((device: DisplayDevice) => {
    const key = `${device.host}:${device.port}`

    if (connectionsRef.current.has(key)) {
      console.log(`Already connected to ${key}`)
      return
    }

    console.log(`Connecting to ${device.name} at ws://${device.host}:${device.port}`)
    const ws = new WebSocket(`ws://${device.host}:${device.port}`)

    ws.onopen = () => {
      console.log(`Connected to ${device.name}`)
      setConnections(prev => new Map(prev).set(key, ws))
    }

    ws.onerror = (error) => {
      console.error(`WebSocket error for ${device.name}:`, error)
    }

    ws.onclose = () => {
      console.log(`Disconnected from ${device.name}`)
      setConnections(prev => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
    }

    return ws
  }, [])

  // Disconnect from a device
  const disconnectFromDevice = useCallback((device: DisplayDevice) => {
    const key = `${device.host}:${device.port}`
    const ws = connectionsRef.current.get(key)
    if (ws) {
      ws.close()
      setConnections(prev => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
    }
  }, [])

  // Broadcast lyrics to all connected devices
  const broadcastLyrics = useCallback((message: LyricsMessage) => {
    const payload: WsMessage = { type: 'lyrics', data: message }
    const json = JSON.stringify(payload)

    connectionsRef.current.forEach((ws, key) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json)
      } else {
        console.warn(`Cannot send to ${key}: not ready`)
      }
    })
  }, [])

  // Broadcast slide to all connected devices
  const broadcastSlide = useCallback((message: SlideMessage) => {
    const payload: WsMessage = { type: 'slide', data: message }
    const json = JSON.stringify(payload)

    connectionsRef.current.forEach((ws, key) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json)
      } else {
        console.warn(`Cannot send to ${key}: not ready`)
      }
    })
  }, [])

  // Disconnect all on unmount
  useEffect(() => {
    return () => {
      connectionsRef.current.forEach(ws => ws.close())
    }
  }, [])

  return {
    devices,
    connections,
    isServerRunning,
    serverPort,
    startServer,
    discoverDevices,
    connectToDevice,
    disconnectFromDevice,
    broadcastLyrics,
    broadcastSlide,
  }
}
