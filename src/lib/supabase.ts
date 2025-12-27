import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { AppConfig } from './config'

let supabaseClient: SupabaseClient | null = null

export function initSupabase(config: AppConfig): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient
  }

  supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  })

  return supabaseClient
}

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    throw new Error('Supabase client not initialized. Call initSupabase first.')
  }
  return supabaseClient
}
