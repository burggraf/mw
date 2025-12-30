import { useEffect, useState, type ReactNode } from 'react'
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

interface AutoStartRedirectProps {
  children: ReactNode
}

/**
 * Wraps the app to handle platform-specific auto-redirects.
 * On Android, redirects directly to display mode.
 * Shows a loading screen while checking platform to prevent flash.
 */
export function AutoStartRedirect({ children }: AutoStartRedirectProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [isChecking, setIsChecking] = useState(() => checkIsTauri())
  const [hasRedirected, setHasRedirected] = useState(false)

  useEffect(() => {
    // Skip if already on display page or already redirected
    if (location.pathname === '/live/display' || location.pathname === '/live/controller') {
      setIsChecking(false)
      return
    }

    if (hasRedirected) {
      setIsChecking(false)
      return
    }

    // Not Tauri - show content immediately
    if (!checkIsTauri()) {
      setIsChecking(false)
      return
    }

    const checkPlatformAndAutoStart = async () => {
      try {
        // Check platform first - Android always goes to display mode
        const platform = await invoke<string>('get_platform')
        console.log('[AutoStartRedirect] Platform:', platform)

        if (platform === 'android') {
          console.log('[AutoStartRedirect] Android detected, going straight to display mode')
          setHasRedirected(true)
          navigate('/live/display', { replace: true })
          return
        }

        // Desktop: Check auto-start mode
        const mode = await invoke<string>('get_auto_start_mode')
        if (mode === 'controller') {
          setHasRedirected(true)
          navigate('/live/controller', { replace: true })
        } else if (mode === 'display') {
          setHasRedirected(true)
          navigate('/live/display', { replace: true })
        } else {
          // No auto-start, show content
          setIsChecking(false)
        }
      } catch (e) {
        console.error('[AutoStartRedirect] Failed to check platform/auto-start mode:', e)
        // Fallback: try user agent detection for Android
        if (isAndroidTV()) {
          console.log('[AutoStartRedirect] Android TV detected via user agent fallback')
          setHasRedirected(true)
          navigate('/live/display', { replace: true })
        } else {
          setIsChecking(false)
        }
      }
    }
    checkPlatformAndAutoStart()
  }, [navigate, location.pathname, hasRedirected])

  // Show loading screen while checking platform (prevents flash)
  if (isChecking) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-white">Mobile Worship</h1>
          <div className="flex items-center justify-center gap-2 text-white/60">
            <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            <span>Loading...</span>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
