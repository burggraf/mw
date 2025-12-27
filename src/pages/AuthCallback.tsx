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
  const [processingTokens, setProcessingTokens] = useState(true)

  useEffect(() => {
    // Handle the auth callback - could be OAuth code or email confirmation tokens
    const handleAuthCallback = async () => {
      console.log('handleAuthCallback: START')
      const supabase = getSupabase()

      // Check for error in URL params (query string)
      const params = new URLSearchParams(window.location.search)
      const errorParam = params.get('error')
      const errorDescription = params.get('error_description')

      if (errorParam) {
        console.error('Auth error (query):', errorParam, errorDescription)
        setError(errorDescription || errorParam)
        setProcessingTokens(false)
        return
      }

      // Check for error in hash (email confirmation errors)
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const hashError = hashParams.get('error')
      const hashErrorDescription = hashParams.get('error_description')

      if (hashError) {
        console.error('Auth error (hash):', hashError, hashErrorDescription)
        setError(hashErrorDescription || hashError)
        setProcessingTokens(false)
        return
      }

      // Check for code in URL (PKCE/OAuth flow)
      const code = params.get('code')
      if (code) {
        console.log('handleAuthCallback: found code, exchanging...')
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          console.error('Error exchanging code for session:', error)
          setError(error.message)
          setProcessingTokens(false)
          return
        }
        console.log('handleAuthCallback: code exchange complete')
        // Clear the URL
        window.history.replaceState(null, '', window.location.pathname)
        setProcessingTokens(false)
        return
      }

      // Check for access_token in hash (email confirmation flow)
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      console.log('handleAuthCallback: checking hash tokens', { hasAccess: !!accessToken, hasRefresh: !!refreshToken })

      if (accessToken && refreshToken) {
        console.log('handleAuthCallback: setting session from hash tokens...')
        // Manually set the session from hash tokens
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (error) {
          console.error('Error setting session from hash tokens:', error)
          setError(error.message)
          setProcessingTokens(false)
          return
        }

        console.log('handleAuthCallback: setSession complete, clearing hash')
        // Clear the hash to clean up the URL
        window.history.replaceState(null, '', window.location.pathname)
        setProcessingTokens(false)
        console.log('handleAuthCallback: DONE (with tokens)')
        return
      }

      // No tokens to process
      console.log('handleAuthCallback: DONE (no tokens)')
      setProcessingTokens(false)
    }

    handleAuthCallback()
  }, [])

  useEffect(() => {
    console.log('AuthCallback redirect check:', { processingTokens, isLoading, error, user: !!user, hasChurch })

    // Still processing tokens from URL
    if (processingTokens) {
      console.log('AuthCallback: still processing tokens, waiting...')
      return
    }

    // Wait for auth to finish loading
    if (isLoading) {
      console.log('AuthCallback: auth still loading, waiting...')
      return
    }

    // If there's an error, don't redirect
    if (error) {
      console.log('AuthCallback: has error, not redirecting')
      return
    }

    // If no user after loading, go to login
    if (!user) {
      console.log('AuthCallback: no user, redirecting to login')
      navigate('/login')
      return
    }

    // If user has church, go to dashboard
    // If not, go to church setup
    if (hasChurch === true) {
      console.log('AuthCallback: hasChurch=true, redirecting to dashboard')
      navigate('/dashboard')
    } else if (hasChurch === false) {
      console.log('AuthCallback: hasChurch=false, redirecting to setup-church')
      navigate('/setup-church')
    } else {
      console.log('AuthCallback: hasChurch is null, still checking...')
    }
  }, [user, isLoading, hasChurch, navigate, error, processingTokens])

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
