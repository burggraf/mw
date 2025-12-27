import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import { ConfigProvider } from './contexts/ConfigContext'
import { AuthProvider } from './contexts/AuthContext'
import { ChurchProvider } from './contexts/ChurchContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { AppLoader } from './components/AppLoader'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ConfigProvider>
        <AppLoader>
          <AuthProvider>
            <ChurchProvider>
              <App />
            </ChurchProvider>
          </AuthProvider>
        </AppLoader>
      </ConfigProvider>
    </ThemeProvider>
  </StrictMode>,
)
