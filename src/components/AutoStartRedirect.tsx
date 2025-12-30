import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { invoke } from '@tauri-apps/api/core'

const checkIsTauri = (): boolean => {
  if (typeof window === 'undefined') return false
  return '__TAURI__' in window || '__TAURI_INTERNALS__' in window
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
        // No auto-start mode, continue to home
      }
    }
    checkAutoStart()
  }, [navigate])

  return null
}
