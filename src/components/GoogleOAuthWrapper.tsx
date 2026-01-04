import { type ReactNode } from 'react'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { useConfig } from '@/contexts/ConfigContext'
import { GoogleAuthProvider } from '@/contexts/GoogleAuthContext'

interface GoogleOAuthWrapperProps {
  children: ReactNode
}

/**
 * Wrapper that provides Google OAuth context using the client ID from config.json
 * This allows the Google Client ID to be loaded at runtime rather than build time.
 */
export function GoogleOAuthWrapper({ children }: GoogleOAuthWrapperProps) {
  const { config } = useConfig()

  const clientId = config?.googleClientId || ''

  // If no client ID configured, still render children but Google features won't work
  if (!clientId) {
    return <>{children}</>
  }

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <GoogleAuthProvider>
        {children}
      </GoogleAuthProvider>
    </GoogleOAuthProvider>
  )
}
