import { useEffect, useState } from 'react'
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

export function AutoStartRedirect() {
  const navigate = useNavigate()
  const { spawnServer, advertiseService } = useNats()
  const [serverPort, setServerPort] = useState<number | null>(null)

  useEffect(() => {
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
        if (platform === 'desktop' && !serverPort) {
          console.log('[AutoStart] Starting NATS server in background on desktop platform')
          const port = await spawnServer()
          setServerPort(port)
          console.log('[AutoStart] NATS server started on port', port)

          // Get device name for advertising
          const deviceName = 'Mobile Worship Controller'
          await advertiseService(port, deviceName)
          console.log('[AutoStart] Advertising NATS service as', deviceName)
        }
      } catch (e) {
        console.error('[AutoStart] Could not auto-start NATS:', e)
      }
    }

    checkAutoStart()
  }, [navigate, serverPort, spawnServer, advertiseService])

  return null
}
