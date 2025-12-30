/**
 * Controller mode entry point
 * Used for desktop apps - full UI with auth, routing, etc.
 */

import { ConfigProvider } from '@/contexts/ConfigContext'
import { AuthProvider } from '@/contexts/AuthContext'
import { ChurchProvider } from '@/contexts/ChurchContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import RootApp from '../../App'

export function ControllerApp() {
  return (
    <ThemeProvider>
      <ConfigProvider>
        <AuthProvider>
          <ChurchProvider>
            <RootApp />
          </ChurchProvider>
        </AuthProvider>
      </ConfigProvider>
    </ThemeProvider>
  )
}
