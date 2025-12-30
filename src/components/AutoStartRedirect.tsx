import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { invoke } from '@tauri-apps/api/core'

const checkIsTauri = (): boolean => {
  if (typeof window === 'undefined') return false
  return '__TAURI__' in window || '__TAURI_INTERNALS__' in window
}

export const isAndroidTV = (): boolean => {
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
  const location = useLocation()
  const [hasRedirected, setHasRedirected] = useState(false)

  useEffect(() => {
    // Skip if already on display page or already redirected
    if (location.pathname === '/live/display' || hasRedirected) return

    // Android TV: Always go straight to display mode, no auth needed
    if (isAndroidTV()) {
      console.log('[AutoStartRedirect] Android TV detected, going straight to display mode')
      setHasRedirected(true)
      navigate('/live/display', { replace: true })
      return
    }

    // Desktop/other: Check Tauri auto-start mode
    if (!checkIsTauri()) return

    const checkAutoStart = async () => {
      try {
        const mode = await invoke<string>('get_auto_start_mode')
        if (mode === 'controller') {
          setHasRedirected(true)
          navigate('/live/controller', { replace: true })
        } else if (mode === 'display') {
          setHasRedirected(true)
          navigate('/live/display', { replace: true })
        }
      } catch (e) {
        console.error('[AutoStartRedirect] Failed to check auto-start mode:', e)
      }
    }
    checkAutoStart()
  }, [navigate, location.pathname, hasRedirected])

  return null
}
