import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { ConfigProvider } from './contexts/ConfigContext'
import { AuthProvider } from './contexts/AuthContext'
import { ChurchProvider } from './contexts/ChurchContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { GoogleAuthProvider } from './contexts/GoogleAuthContext'
import { AppRoutes } from './routes'
import './i18n'
import './index.css'

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ConfigProvider>
        <AuthProvider>
          <ChurchProvider>
            <GoogleOAuthProvider clientId={googleClientId}>
              <GoogleAuthProvider>
                <AppRoutes />
              </GoogleAuthProvider>
            </GoogleOAuthProvider>
          </ChurchProvider>
        </AuthProvider>
      </ConfigProvider>
    </ThemeProvider>
  </StrictMode>
)
