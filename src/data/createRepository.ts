import type { Repository } from './repository'
import { LocalRepository } from './local/LocalRepository'
import { getSupabaseClient } from './supabase/client'
import { SupabaseRepository } from './supabase/SupabaseRepository'
import { SyncedRepository } from './sync/SyncedRepository'

/** Supabase (behind the offline mirror and outbox) when VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are set, else the local no-backend mode. */
export function createRepository(): Repository {
  const client = getSupabaseClient()
  if (client) return new SyncedRepository(new SupabaseRepository(client))
  return new LocalRepository()
}
