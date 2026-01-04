import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from './contexts/ConfigContext'
import { AuthProvider } from './contexts/AuthContext'
import { ChurchProvider } from './contexts/ChurchContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { GoogleOAuthWrapper } from './components/GoogleOAuthWrapper'
import { AppRoutes } from './routes'
import './i18n'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ConfigProvider>
        <AuthProvider>
          <ChurchProvider>
            <GoogleOAuthWrapper>
              <AppRoutes />
            </GoogleOAuthWrapper>
          </ChurchProvider>
        </AuthProvider>
      </ConfigProvider>
    </ThemeProvider>
  </StrictMode>
)
