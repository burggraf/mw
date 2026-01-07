import { createClient } from '@supabase/supabase-js'

export interface AppConfig {
  supabaseUrl: string
  supabaseAnonKey: string
  apiVersion: string
  minAppVersion: string
  maintenance: boolean
  maintenanceMessage: string | null
  googleClientId?: string
}

// Source of truth for config
const REMOTE_CONFIG = 'https://mobileworship.com/config.json'

const CACHE_KEY = 'mw_config'

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

/**
 * Test if Supabase credentials are valid by creating a minimal client
 * and checking if we can connect (doesn't require auth)
 */
async function validateSupabaseConfig(url: string, anonKey: string): Promise<boolean> {
  try {
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    })
    // Try a simple health check - just getting the session should validate the URL/key
    const { error } = await client.auth.getSession()
    // An error about invalid credentials means the config is bad
    // But "no session" is expected and fine
    if (error?.message?.includes('Invalid') || error?.message?.includes('API key')) {
      return false
    }
    return true
  } catch {
    return false
  }
}

function getCachedConfig(): AppConfig | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as CachedConfig
    return cached.config
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

/**
 * Load config with remote-first, cache-fallback strategy:
 * 1. Try cached values first
 * 2. If cache doesn't exist or doesn't work, fetch from remote
 * 3. Cache the remote values for future use
 */
export async function loadConfig(): Promise<AppConfig> {
  const cached = getCachedConfig()

  // Step 1: Try cached config first
  if (cached) {
    const isValid = await validateSupabaseConfig(cached.supabaseUrl, cached.supabaseAnonKey)
    if (isValid) {
      console.log('[Config] Using cached config')
      return cached
    }
    console.log('[Config] Cached config invalid, fetching fresh')
  }

  // Step 2: Fetch from remote (source of truth)
  console.log('[Config] Fetching from remote:', REMOTE_CONFIG)
  const config = await fetchConfig(REMOTE_CONFIG)

  // Validate the remote config before using it
  const isValid = await validateSupabaseConfig(config.supabaseUrl, config.supabaseAnonKey)
  if (!isValid) {
    throw new Error('Remote config contains invalid Supabase credentials')
  }

  // Step 3: Cache the valid config for future use
  setCachedConfig(config)
  console.log('[Config] Cached remote config')

  return config
}
