// Every intake function runs as the signed-in user: the bearer token must belong to a real user and that user must be
// a member of the household the request names. The service-role client is used only for reads the function needs and
// for the usage ledger; writes that should obey RLS go through the user's own client.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { json } from './http.ts'

export type Role = 'owner' | 'editor' | 'viewer' | 'agent'

export interface Caller {
  /** Service-role client for reads the function needs. Never hand it to user input. */
  admin: SupabaseClient
  /** A client that carries the user's token; RLS applies. */
  asUser: SupabaseClient
  userId: string
  householdId: string
  role: Role
}

export interface Env {
  supabaseUrl: string
  serviceKey: string
  anonKey: string
}

export function readEnv(): Env | Response {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !serviceKey || !anonKey) return json({ error: 'The function is missing its Supabase settings.' }, 503)
  return { supabaseUrl, serviceKey, anonKey }
}

/** Verify the token and the membership. Returns a ready Response (401, 403, 400) when the caller may not proceed. */
export async function authenticate(req: Request, env: Env, householdId: unknown, allowed: Role[] = ['owner', 'editor', 'agent']): Promise<Caller | Response> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Not signed in' }, 401)
  if (typeof householdId !== 'string' || !householdId) return json({ error: 'householdId is required' }, 400)
  const asUser = createClient(env.supabaseUrl, env.anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: userData, error } = await asUser.auth.getUser()
  if (error || !userData.user) return json({ error: 'Not signed in' }, 401)
  const admin = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false } })
  const { data: m } = await admin.from('memberships').select('role').eq('household_id', householdId).eq('user_id', userData.user.id).maybeSingle()
  const role = (m?.role ?? null) as Role | null
  if (!role || !allowed.includes(role)) return json({ error: 'You are not a member of this household, or your role cannot do this.' }, 403)
  return { admin, asUser, userId: userData.user.id, householdId, role }
}
