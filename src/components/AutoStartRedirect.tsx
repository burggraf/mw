import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { invoke } from '@tauri-apps/api/core'
import { useNats } from '@/hooks/useNats'

// Check if running in Tauri (runtime check for dev mode compatibility)
const checkIsTauri = (): boolean => {
  if (typeof window === 'undefined') return false
  // Check for Tauri globals first (production build)
  if ('__TAURI__' in window || '__TAURI_INTERNALS__' in window) return true
  // In dev mode, try to detect by checking if invoke is available
  try {
    return typeof invoke === 'function' && invoke.name !== 'invoke'
  } catch {
    return false
  }
}

// Module-level flag that persists across HMR (won't persist on page refresh)
let moduleLevelHasSpawned = false
let spawnCallCount = 0

export function AutoStartRedirect() {
  const navigate = useNavigate()
  const { spawnServer, advertiseService } = useNats()
  // Use a ref to ensure we only spawn once per app session
  const hasSpawnedRef = useRef(false)
  const renderCountRef = useRef(0)
  renderCountRef.current++

  useEffect(() => {
    // Prevent multiple spawns (React StrictMode, hot reload, etc.)
    spawnCallCount++
    const caller = new Error().stack?.split('\n')[2]?.trim() || 'unknown'

    console.log(`[AutoStart] Effect called (count=${spawnCallCount}, render=${renderCountRef.current}, moduleFlag=${moduleLevelHasSpawned}, refFlag=${hasSpawnedRef.current})`)
    console.log(`[AutoStart] Caller: ${caller}`)

    if (hasSpawnedRef.current || moduleLevelHasSpawned) {
      console.log('[AutoStart] Already spawned, skipping')
      return
    }

    console.log('[AutoStart] Component mounted, checkIsTauri:', checkIsTauri())

    if (!checkIsTauri()) {
      console.log('[AutoStart] Not running in Tauri, skipping')
      return
    }

    const checkAutoStart = async () => {
      try {
        const mode = await invoke<string>('get_auto_start_mode')
        console.log('[AutoStart] Auto-start mode:', mode)
        if (mode === 'controller') {
          navigate('/live/controller', { replace: true })
          return // Return early for controller mode
        } else if (mode === 'display') {
          navigate('/live/display', { replace: true })
          return // Return early for display mode
        }
        // For "none" mode, continue to NATS server startup
      } catch (e) {
        // Command not available or error, continue to auto-start logic
        console.log('[AutoStart] No auto-start mode, continuing to desktop controller start')
      }

      // On desktop (not Android TV), automatically start NATS server in background
      try {
        const platform = await invoke<string>('get_platform')
        console.log('[AutoStart] Platform:', platform)
        if (platform === 'desktop') {
          // Mark as spawned BEFORE the async operation to prevent race conditions
          hasSpawnedRef.current = true
          moduleLevelHasSpawned = true
          console.log('[AutoStart] Starting NATS server in background on desktop platform')
          const port = await spawnServer()
          console.log('[AutoStart] NATS server started on port', port)

          // Get device name for advertising
          const deviceName = 'Mobile Worship Controller'
          await advertiseService(port, deviceName)
          console.log('[AutoStart] Advertising NATS service as', deviceName)
        }
      } catch (e) {
        console.error('[AutoStart] Could not auto-start NATS:', e)
        // Reset flags on error so we can retry
        hasSpawnedRef.current = false
        moduleLevelHasSpawned = false
      }
    }

    checkAutoStart()
  }, [navigate, spawnServer, advertiseService])

  return null
}
