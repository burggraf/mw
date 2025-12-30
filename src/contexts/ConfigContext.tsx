import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { loadConfig, type AppConfig } from '@/lib/config'
import { initSupabase } from '@/lib/supabase'

interface ConfigContextType {
  config: AppConfig | null
  isLoading: boolean
  error: Error | null
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined)

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function init() {
      try {
        const loadedConfig = await loadConfig()

        // Check maintenance mode
        if (loadedConfig.maintenance) {
          setError(new Error(loadedConfig.maintenanceMessage || 'App is under maintenance'))
          setIsLoading(false)
          return
        }

        // Initialize Supabase with persistent storage
        await initSupabase(loadedConfig)

        setConfig(loadedConfig)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load configuration'))
      } finally {
        setIsLoading(false)
      }
    }

    init()
  }, [])

  // Don't render children until config is loaded and ready
  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-lg font-semibold text-destructive">Configuration Error</p>
          <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        </div>
      </div>
    )
  }

  return (
    <ConfigContext.Provider value={{ config, isLoading, error }}>
      {children}
    </ConfigContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfig() {
  const context = useContext(ConfigContext)
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider')
  }
  return context
}
