import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import { ConfigProvider } from './contexts/ConfigContext'
import { AuthProvider } from './contexts/AuthContext'
import { AppLoader } from './components/AppLoader'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider>
      <AppLoader>
        <AuthProvider>
          <App />
        </AuthProvider>
      </AppLoader>
    </ConfigProvider>
  </StrictMode>,
)
