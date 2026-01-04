export interface AppConfig {
  supabaseUrl: string
  supabaseAnonKey: string
  apiVersion: string
  minAppVersion: string
  maintenance: boolean
  maintenanceMessage: string | null
  googleClientId?: string
}

// Try local bundled config first, then fallback to remote
const LOCAL_CONFIG = '/config.json'
const REMOTE_CONFIG = 'https://app.mobileworship.app/config.json'

const CACHE_KEY = 'mw_config'
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

interface CachedConfig {
  config: AppConfig
  timestamp: number
}

async function fetchConfig(url: string): Promise<AppConfig> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch config: ${response.status}`)
  }
  return await response.json() as AppConfig
}

export async function loadConfig(): Promise<AppConfig> {
  // Try to load from cache first
  const cached = getCachedConfig()

  // In dev or if cache is expired, fetch fresh config
  if (import.meta.env.DEV || !cached || Date.now() - cached.timestamp > CACHE_TTL) {
    try {
      // Try local bundled config first (for Tauri/Android apps)
      const config = await fetchConfig(LOCAL_CONFIG)
      setCachedConfig(config)
      return config
    } catch (localError) {
      console.warn('Local config failed, trying remote:', localError)
      try {
        // Fallback to remote config
        const config = await fetchConfig(REMOTE_CONFIG)
        setCachedConfig(config)
        return config
      } catch (remoteError) {
        // If both fail but we have cache, use it
        if (cached) {
          console.warn('Remote config failed, using cached version:', remoteError)
          return cached.config
        }
        throw new Error(`Failed to load config from both local and remote sources`)
      }
    }
  }

  return cached.config
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
