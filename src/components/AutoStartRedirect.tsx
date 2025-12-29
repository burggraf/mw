import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { invoke } from '@tauri-apps/api/core'

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

  useEffect(() => {
    if (!checkIsTauri()) return

    const checkAutoStart = async () => {
      try {
        const mode = await invoke<string>('get_auto_start_mode')
        if (mode === 'controller') {
          navigate('/live/controller', { replace: true })
        } else if (mode === 'display') {
          navigate('/live/display', { replace: true })
        }
      } catch (e) {
        // Command not available or error, ignore
        console.debug('No auto-start mode:', e)
      }
    }

    checkAutoStart()
  }, [navigate])

  return null
}
