import type { Repository } from './repository'
import { LocalRepository } from './local/LocalRepository'
import { getSupabaseClient } from './supabase/client'
import { SupabaseRepository } from './supabase/SupabaseRepository'

/** Supabase when VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are set, else the local no-backend mode. */
export function createRepository(): Repository {
  const client = getSupabaseClient()
  if (client) return new SupabaseRepository(client)
  return new LocalRepository()
}
