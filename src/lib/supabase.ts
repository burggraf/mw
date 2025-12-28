import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Local type definitions for Supabase config
export interface AppConfig {
  supabaseUrl: string
  supabaseAnonKey: string
}

interface StorageAdapter {
  name: string
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

let supabaseClient: SupabaseClient | null = null
let initPromise: Promise<SupabaseClient> | null = null

// In-memory cache for Tauri Store data (loaded synchronously at startup)
const memoryCache = new Map<string, string>();
let tauriStoreReady = false;

/**
 * Tauri Store-based storage adapter
 * Uses in-memory cache for synchronous reads, persists writes asynchronously
 */
function createStorageAdapter(): StorageAdapter {
  return {
    name: 'tauri-storage',
    getItem: (key: string): string | null => {
      return memoryCache.get(key) ?? null;
    },
    setItem: (key: string, value: string): void => {
      memoryCache.set(key, value);
      // Persist to Tauri Store asynchronously
      if (tauriStoreReady) {
        import('@tauri-apps/plugin-store').then(({ Store }) => {
          Store.load('supabase-auth.json').then(store => {
            store.set(key, value).then(() => store.save()).catch(e => {
              console.error('[Storage] Save error:', key, e);
            });
          });
        });
      }
    },
    removeItem: (key: string): void => {
      memoryCache.delete(key);
      if (tauriStoreReady) {
        import('@tauri-apps/plugin-store').then(({ Store }) => {
          Store.load('supabase-auth.json').then(store => {
            store.delete(key).then(() => store.save()).catch(e => {
              console.error('[Storage] Delete error:', e);
            });
          });
        });
      }
    },
  };
}

/**
 * Preload all data from Tauri Store into memory cache
 */
async function preloadStore(): Promise<void> {
  try {
    const { Store } = await import('@tauri-apps/plugin-store');
    const store = await Store.load('supabase-auth.json');
    const keys = await store.keys();

    for (const key of keys) {
      const value = await store.get<string>(key);
      if (value !== null && value !== undefined) {
        memoryCache.set(key, value);
      }
    }
    tauriStoreReady = true;
  } catch (e) {
    console.error('[Storage] Preload error:', e);
  }
}

export async function initSupabase(config: AppConfig): Promise<SupabaseClient> {
  // If already initialized, return immediately
  if (supabaseClient) {
    return supabaseClient;
  }

  // If initialization is in progress, wait for it
  if (initPromise) {
    return initPromise;
  }

  // Start initialization
  initPromise = (async () => {
    try {
      return await doInitSupabase(config);
    } finally {
      // Clear the promise after completion (whether success or failure)
      initPromise = null;
    }
  })();

  return initPromise;
}

async function doInitSupabase(config: AppConfig): Promise<SupabaseClient> {
  // Check if running in Tauri
  const isTauri = typeof window !== 'undefined' && (
    '__TAURI__' in window ||
    '__TAURI_INTERNALS__' in window ||
    'windowControls' in window
  );

  if (isTauri) {
    // Preload from Tauri Store before creating client
    await preloadStore();
  }

  const storage = isTauri ? createStorageAdapter() : window.localStorage;

  supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storage,
    },
  });

  // Check if session was restored
  const { data: sessionData } = await supabaseClient.auth.getSession();
  console.log('[Supabase] Session restored:', !!sessionData.session);

  return supabaseClient;
}

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    throw new Error('Supabase client not initialized. Call initSupabase first.');
  }
  return supabaseClient;
}
