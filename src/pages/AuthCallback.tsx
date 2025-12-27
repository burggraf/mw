import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabase } from '@/lib/supabase'

export function AuthCallbackPage() {
  const { t } = useTranslation()
  const { user, isLoading, hasChurch } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Handle the auth callback - could be OAuth code or email confirmation tokens
    const handleAuthCallback = async () => {
      const supabase = getSupabase()

      // Check for error in URL params (query string)
      const params = new URLSearchParams(window.location.search)
      const errorParam = params.get('error')
      const errorDescription = params.get('error_description')

      if (errorParam) {
        console.error('Auth error (query):', errorParam, errorDescription)
        setError(errorDescription || errorParam)
        return
      }

      // Check for error in hash (email confirmation errors)
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const hashError = hashParams.get('error')
      const hashErrorDescription = hashParams.get('error_description')

      if (hashError) {
        console.error('Auth error (hash):', hashError, hashErrorDescription)
        setError(hashErrorDescription || hashError)
        return
      }

      // Check for code in URL (PKCE/OAuth flow)
      const code = params.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          console.error('Error exchanging code for session:', error)
          setError(error.message)
          return
        }
      }

      // Check for access_token in hash (email confirmation flow)
      // Supabase's detectSessionInUrl should handle this automatically,
      // but we'll trigger a session refresh to be safe
      const accessToken = hashParams.get('access_token')
      if (accessToken) {
        // The token is in the URL - Supabase should pick it up automatically
        // Just need to wait for the auth state to update
        // Clear the hash to clean up the URL
        window.history.replaceState(null, '', window.location.pathname)
      }
    }

    handleAuthCallback()
  }, [])

  useEffect(() => {
    // Wait for auth to finish loading
    if (isLoading) return

    // If there's an error, don't redirect yet
    if (error) return

    // If no user after loading, go to login
    if (!user) {
      // Give it a moment - session might still be processing
      const timeout = setTimeout(() => {
        navigate('/login')
      }, 2000)
      return () => clearTimeout(timeout)
    }

    // If user has church, go to dashboard
    // If not, go to church setup
    if (hasChurch === true) {
      navigate('/dashboard')
    } else if (hasChurch === false) {
      navigate('/setup-church')
    }
    // If hasChurch is null, we're still checking - wait
  }, [user, isLoading, hasChurch, navigate, error])

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md px-4">
          <div className="text-6xl">⚠️</div>
          <h1 className="text-xl font-bold text-destructive">Authentication Error</h1>
          <p className="text-muted-foreground">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="text-primary hover:underline"
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    </div>
  )
}
