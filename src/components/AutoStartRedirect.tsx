import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { invoke } from '@tauri-apps/api/core'

const checkIsTauri = (): boolean => {
  if (typeof window === 'undefined') return false
  return '__TAURI__' in window || '__TAURI_INTERNALS__' in window
}

const isAndroidTV = (): boolean => {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  return ua.includes('Android') && (
    ua.includes('FireTV') ||
    ua.includes('AFTM') ||
    ua.includes('tv') ||
    // Check for common Android TV indicators
    !ua.includes('Mobile')
  )
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
        } else if (mode === 'none') {
          // Check if we're on Android TV - default to display mode
          if (isAndroidTV()) {
            console.log('[AutoStartRedirect] Android TV detected, defaulting to display mode')
            navigate('/live/display', { replace: true })
          }
        }
      } catch (e) {
        console.error('[AutoStartRedirect] Failed to check auto-start mode:', e)
        // On error, if Android TV, still try to go to display mode
        if (isAndroidTV()) {
          console.log('[AutoStartRedirect] Android TV detected (error fallback), defaulting to display mode')
          navigate('/live/display', { replace: true })
        }
      }
    }
    checkAutoStart()
  }, [navigate])

  return null
}
