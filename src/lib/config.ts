export interface AppConfig {
  supabaseUrl: string
  supabaseAnonKey: string
  apiVersion: string
  minAppVersion: string
  maintenance: boolean
  maintenanceMessage: string | null
}

const CONFIG_URL = import.meta.env.DEV
  ? '/config.json'
  : 'https://app.mobileworship.app/config.json'

const CACHE_KEY = 'mw_config'
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

interface CachedConfig {
  config: AppConfig
  timestamp: number
}

export async function loadConfig(): Promise<AppConfig> {
  // Try to load from cache first
  const cached = getCachedConfig()

  try {
    // In dev, always fetch fresh. In prod, respect TTL.
    if (import.meta.env.DEV || !cached || Date.now() - cached.timestamp > CACHE_TTL) {
      const response = await fetch(CONFIG_URL)
      if (!response.ok) {
        throw new Error(`Failed to fetch config: ${response.status}`)
      }
      const config = await response.json() as AppConfig
      setCachedConfig(config)
      return config
    }
    return cached.config
  } catch (error) {
    // If fetch fails but we have cache, use it
    if (cached) {
      console.warn('Failed to fetch config, using cached version:', error)
      return cached.config
    }
    throw error
  }
}

function getCachedConfig(): CachedConfig | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as CachedConfig
  } catch {
    return null
  }
}

function setCachedConfig(config: AppConfig): void {
  try {
    const cached: CachedConfig = {
      config,
      timestamp: Date.now(),
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached))
  } catch {
    // localStorage might be unavailable
  }
}
