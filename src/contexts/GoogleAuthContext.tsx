import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { useGoogleLogin, type TokenResponse } from '@react-oauth/google'

interface GoogleAuthContextType {
  accessToken: string | null
  isAuthenticated: boolean
  login: () => void
  logout: () => void
  error: string | null
}

const GoogleAuthContext = createContext<GoogleAuthContextType | null>(null)

export function useGoogleAuth() {
  const context = useContext(GoogleAuthContext)
  if (!context) {
    throw new Error('useGoogleAuth must be used within a GoogleAuthProvider')
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
        login,
        logout,
        error,
      }}
    >
      {children}
    </GoogleAuthContext.Provider>
  )
}
