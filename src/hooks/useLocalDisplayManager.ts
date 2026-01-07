import { useEffect, useRef, useCallback } from 'react'
import { useChurch } from '@/contexts/ChurchContext'
import { isTauri, safeInvoke } from '@/lib/tauri'
import { registerLocalDisplay, updateDisplayHeartbeat } from '@/services/displays'

interface LocalDisplayOpenedPayload {
  display_id: string
  display_name: string
  device_id: string
  width: number
  height: number
}

interface LocalDisplayClosedPayload {
  display_id: string
}

// Matches the Rust LocalDisplayInfo struct
interface LocalDisplayInfo {
  display_id: string
  display_name: string
  device_id: string
  width: number
  height: number
}

// Store heartbeat intervals outside React lifecycle to prevent cleanup issues
const heartbeatIntervals = new Map<string, ReturnType<typeof setInterval>>()

// Track which displays have been registered to prevent duplicates
const registeredDisplays = new Set<string>()

/**
 * Hook that manages local displays opened by the Tauri DisplayManager.
 *
 * The DisplayManager (Rust) detects external monitors and opens fullscreen windows.
 * It emits events to notify the frontend, which handles DB registration and heartbeats.
 *
 * This hook should be used in the main window (AppLayout) which has access to
 * ChurchContext with the authenticated user's church.
 */
export function useLocalDisplayManager() {
  const { currentChurch } = useChurch()
  const currentChurchRef = useRef(currentChurch)
  const pendingDisplays = useRef<LocalDisplayOpenedPayload[]>([])
  const initialFetchDone = useRef(false)

  // Keep ref in sync with state
  useEffect(() => {
    currentChurchRef.current = currentChurch
  }, [currentChurch])

  const startHeartbeat = useCallback((displayId: string) => {
    // Don't start if already running
    if (heartbeatIntervals.has(displayId)) {
      console.log('[LocalDisplayManager] Heartbeat already running for:', displayId)
      return
    }

    const interval = setInterval(async () => {
      try {
        await updateDisplayHeartbeat(displayId)
        console.log('[LocalDisplayManager] Heartbeat sent for:', displayId)
      } catch (err) {
        console.error('[LocalDisplayManager] Heartbeat failed for', displayId, err)
      }
    }, 10000) // Every 10 seconds

    heartbeatIntervals.set(displayId, interval)
    console.log('[LocalDisplayManager] Started heartbeat for:', displayId)
  }, [])

  const stopHeartbeat = useCallback((displayId: string) => {
    const interval = heartbeatIntervals.get(displayId)
    if (interval) {
      clearInterval(interval)
      heartbeatIntervals.delete(displayId)
      registeredDisplays.delete(displayId)
      console.log('[LocalDisplayManager] Stopped heartbeat for:', displayId)
    }
  }, [])

  const registerAndStartHeartbeat = useCallback(async (
    payload: LocalDisplayOpenedPayload,
    churchId: string
  ) => {
    // Prevent duplicate registrations
    const key = `${churchId}:${payload.display_id}`
    if (registeredDisplays.has(key)) {
      console.log('[LocalDisplayManager] Display already registered:', payload.display_id)
      return
    }

    try {
      console.log('[LocalDisplayManager] Registering display:', payload.display_id, 'for church:', churchId)

      // Register/update the display in the database
      await registerLocalDisplay(
        churchId,
        payload.display_id,
        payload.display_name,
        payload.device_id
      )

      registeredDisplays.add(key)
      console.log('[LocalDisplayManager] Display registered successfully:', payload.display_id)

      // Start heartbeat
      startHeartbeat(payload.display_id)
    } catch (err) {
      console.error('[LocalDisplayManager] Failed to register display:', payload.display_id, err)
    }
  }, [startHeartbeat])

  // Fetch and register existing displays when church becomes available
  useEffect(() => {
    if (!currentChurch || !isTauri()) return

    const fetchAndRegisterExisting = async () => {
      // Only fetch once per church
      if (initialFetchDone.current) return
      initialFetchDone.current = true

      console.log('[LocalDisplayManager] Fetching existing local displays...')

      try {
        const displays = await safeInvoke<LocalDisplayInfo[]>('get_open_local_displays')
        if (displays && displays.length > 0) {
          console.log('[LocalDisplayManager] Found', displays.length, 'existing displays')
          for (const display of displays) {
            await registerAndStartHeartbeat({
              display_id: display.display_id,
              display_name: display.display_name,
              device_id: display.device_id,
              width: display.width,
              height: display.height,
            }, currentChurch.id)
          }
        } else {
          console.log('[LocalDisplayManager] No existing displays found')
        }
      } catch (err) {
        console.error('[LocalDisplayManager] Failed to fetch existing displays:', err)
      }

      // Process any pending displays that were queued before church was ready
      const pending = pendingDisplays.current
      if (pending.length > 0) {
        console.log('[LocalDisplayManager] Processing', pending.length, 'pending displays')
        pendingDisplays.current = []
        for (const display of pending) {
          await registerAndStartHeartbeat(display, currentChurch.id)
        }
      }
    }

    fetchAndRegisterExisting()
  }, [currentChurch?.id, registerAndStartHeartbeat])

  // Set up event listeners for display opened/closed events
  useEffect(() => {
    if (!isTauri()) return

    let unlistenOpened: (() => void) | undefined
    let unlistenClosed: (() => void) | undefined

    const setupListeners = async () => {
      const { listen } = await import('@tauri-apps/api/event')

      // Listen for new displays being opened
      unlistenOpened = await listen<LocalDisplayOpenedPayload>('local-display-opened', (event) => {
        console.log('[LocalDisplayManager] Received local-display-opened event:', event.payload)
        const church = currentChurchRef.current
        if (church) {
          registerAndStartHeartbeat(event.payload, church.id)
        } else {
          // Queue for later when church is available
          pendingDisplays.current.push(event.payload)
          console.log('[LocalDisplayManager] Church not ready, queuing display:', event.payload.display_id)
        }
      })

      // Listen for displays being closed
      unlistenClosed = await listen<LocalDisplayClosedPayload>('local-display-closed', (event) => {
        console.log('[LocalDisplayManager] Received local-display-closed event:', event.payload)
        stopHeartbeat(event.payload.display_id)
      })

      console.log('[LocalDisplayManager] Event listeners set up')
    }

    setupListeners()

    return () => {
      // Only clean up listeners, NOT heartbeats (they should persist)
      unlistenOpened?.()
      unlistenClosed?.()
    }
  }, [registerAndStartHeartbeat, stopHeartbeat])

  // Reset initialFetchDone when church changes
  useEffect(() => {
    initialFetchDone.current = false
  }, [currentChurch?.id])

  // Clean up heartbeats only on full unmount (not effect re-runs)
  useEffect(() => {
    return () => {
      // This runs when the component fully unmounts
      console.log('[LocalDisplayManager] Component unmounting, clearing all heartbeats')
      for (const [displayId, interval] of heartbeatIntervals) {
        clearInterval(interval)
        console.log('[LocalDisplayManager] Cleaned up heartbeat for:', displayId)
      }
      heartbeatIntervals.clear()
      registeredDisplays.clear()
    }
  }, []) // Empty deps = only runs on mount/unmount
}
