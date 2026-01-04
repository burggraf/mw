import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { useGoogleLogin, type TokenResponse } from '@react-oauth/google'

interface GoogleAuthContextType {
  accessToken: string | null
  isAuthenticated: boolean
  isConfigured: boolean
  login: () => void
  logout: () => void
  error: string | null
}

const GoogleAuthContext = createContext<GoogleAuthContextType | null>(null)

export function useGoogleAuth(): GoogleAuthContextType {
  const context = useContext(GoogleAuthContext)
  // Return a safe default if Google OAuth is not configured
  if (!context) {
    return {
      accessToken: null,
      isAuthenticated: false,
      isConfigured: false,
      login: () => {
        console.warn('Google OAuth is not configured. Add googleClientId to config.json')
      },
      logout: () => {},
      error: null,
    }
  }
  return context
}

interface GoogleAuthProviderProps {
  children: ReactNode
}

export function GoogleAuthProvider({ children }: GoogleAuthProviderProps) {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const login = useGoogleLogin({
    onSuccess: (tokenResponse: TokenResponse) => {
      setAccessToken(tokenResponse.access_token)
      setError(null)
    },
    onError: (errorResponse) => {
      console.error('Google login failed:', errorResponse)
      setError('Failed to connect to Google. Please try again.')
      setAccessToken(null)
    },
    scope: 'https://www.googleapis.com/auth/presentations.readonly https://www.googleapis.com/auth/drive.readonly',
  })

  const logout = useCallback(() => {
    setAccessToken(null)
    setError(null)
  }, [])

  return (
    <GoogleAuthContext.Provider
      value={{
        accessToken,
        isAuthenticated: !!accessToken,
        isConfigured: true,
        login,
        logout,
        error,
      }}
    >
      {children}
    </GoogleAuthContext.Provider>
  )
}
