import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export type QmSupabaseClient = SupabaseClient<Database>

export function supabaseConfig(): { url: string; key: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
  if (!url || !key) return null
  return { url, key }
}

let client: QmSupabaseClient | null = null

export function getSupabaseClient(): QmSupabaseClient | null {
  if (client) return client
  const cfg = supabaseConfig()
  if (!cfg) return null
  client = createClient<Database>(cfg.url, cfg.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  })
  return client
}
