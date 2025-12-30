import { invoke } from '@tauri-apps/api/core'
import { useState, useCallback, useEffect } from 'react'

export interface NatsNode {
  id: string
  name: string
  host: string
  port: number
  platform: string
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

export function useNats() {
  const [serverPort, setServerPort] = useState<number | null>(null)
  const [discoveredNodes, setDiscoveredNodes] = useState<NatsNode[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [isServerRunning, setIsServerRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string | null>(null)

  // Check connection status on mount
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const connected = await invoke<boolean>('is_nats_connected')
        setIsConnected(connected)
        if (connected) {
          const url = await invoke<string | null>('get_nats_server_url')
          setServerUrl(url)
        }
      } catch (e) {
        // Commands may not be available in all contexts
        console.debug('[useNats] Could not check connection status:', e)
      }
    }
    checkConnection()
  }, [])

  // Spawn NATS server (for displays and controllers)
  const spawnServer = useCallback(async () => {
    try {
      setError(null)
      console.log('[useNats] Spawning NATS server...')
      const port = await invoke<number>('spawn_nats_server')
      setServerPort(port)
      setIsServerRunning(true)
      console.log('[useNats] NATS server spawned on port', port)
      return port
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      console.error('[useNats] Failed to spawn NATS server:', err)
      setError(err)
      throw e
    }
  }, [])

  // Discover NATS cluster nodes via mDNS
  const discoverCluster = useCallback(async () => {
    try {
      console.log('[useNats] Discovering NATS cluster nodes...')
      const nodes = await invoke<NatsNode[]>('discover_nats_cluster')
      setDiscoveredNodes(nodes)
      console.log('[useNats] Discovered nodes:', nodes)
      return nodes
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      console.error('[useNats] Failed to discover cluster:', err)
      setError(err)
      return []
    }
  }, [])

  // Connect to a specific NATS node
  const connect = useCallback(async (host: string, port: number) => {
    try {
      setError(null)
      console.log(`[useNats] Connecting to NATS at ${host}:${port}`)
      await invoke('connect_nats_server', { host, port })
      setIsConnected(true)

      const url = await invoke<string | null>('get_nats_server_url')
      setServerUrl(url)

      console.log('[useNats] Connected to NATS server')
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      console.error('[useNats] Failed to connect:', err)
      setError(err)
      setIsConnected(false)
      throw e
    }
  }, [])

  // Disconnect from NATS server
  const disconnect = useCallback(async () => {
    try {
      console.log('[useNats] Disconnecting from NATS server...')
      await invoke('disconnect_nats_server')
      setIsConnected(false)
      setServerUrl(null)
      console.log('[useNats] Disconnected from NATS server')
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      console.error('[useNats] Failed to disconnect:', err)
      setError(err)
    }
  }, [])

  // Stop the NATS server
  const stopServer = useCallback(async () => {
    try {
      console.log('[useNats] Stopping NATS server...')
      await invoke('stop_nats_server')
      setServerPort(null)
      setIsServerRunning(false)
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      console.error('[useNats] Failed to stop server:', err)
      setError(err)
    }
  }, [])

  // Advertise our NATS server via mDNS
  const advertiseService = useCallback(async (port: number, deviceName: string) => {
    try {
      console.log(`[useNats] Advertising NATS service on port ${port} as ${deviceName}`)
      await invoke('advertise_nats_service', { port, deviceName })
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      console.error('[useNats] Failed to advertise service:', err)
      setError(err)
    }
  }, [])

  // Publish lyrics to connected displays
  const publishLyrics = useCallback(async (message: LyricsMessage) => {
    try {
      console.log('[useNats] Publishing lyrics:', message.title)
      await invoke('publish_nats_lyrics', {
        churchId: message.church_id,
        eventId: message.event_id,
        songId: message.song_id,
        title: message.title,
        lyrics: message.lyrics,
        backgroundUrl: message.background_url,
      })
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      console.error('[useNats] Failed to publish lyrics:', err)
      setError(err)
      throw e
    }
  }, [])

  // Publish slide update to connected displays
  const publishSlide = useCallback(async (message: SlideMessage) => {
    try {
      console.log('[useNats] Publishing slide:', message.slide_index)
      await invoke('publish_nats_slide', {
        churchId: message.church_id,
        eventId: message.event_id,
        songId: message.song_id,
        slideIndex: message.slide_index,
      })
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      console.error('[useNats] Failed to publish slide:', err)
      setError(err)
      throw e
    }
  }, [])

  return {
    serverPort,
    discoveredNodes,
    isConnected,
    isServerRunning,
    error,
    serverUrl,
    spawnServer,
    discoverCluster,
    connect,
    disconnect,
    stopServer,
    advertiseService,
    publishLyrics,
    publishSlide,
  }
}
