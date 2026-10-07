import type { Household, Membership, Profile, Role, TenantRow } from '@/domain/types'
import { toCamel, toSnake } from './casing'
import type { QmSupabaseClient } from './client'
import {
  nowIso,
  type ChangeEvent,
  type Collection,
  type CreateHouseholdInput,
  type Repository,
  type SessionInfo,
  type TableMap,
  type TableName,
  type Unsubscribe,
} from '../repository'

/** Talks to Supabase as the signed-in user; every row passes RLS. Realtime changes fan out through subscribe(). */
export class SupabaseRepository implements Repository {
  readonly mode = 'supabase' as const
  private listeners = new Set<(e: ChangeEvent) => void>()
  private channelHousehold: string | null = null
  private channel: ReturnType<QmSupabaseClient['channel']> | null = null
  private readonly client: QmSupabaseClient

  constructor(client: QmSupabaseClient) {
    this.client = client
  }

  private async userId(): Promise<string> {
    const { data, error } = await this.client.auth.getUser()
    if (error || !data.user) throw new Error('Not signed in')
    return data.user.id
  }

  async session(): Promise<SessionInfo> {
    const userId = await this.userId()
    const [{ data: profileRow }, { data: memberRows, error }] = await Promise.all([
      this.client.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
      this.client.from('memberships').select('*').eq('user_id', userId).is('deleted_at', null),
    ])
    if (error) throw error
    const memberships = (memberRows ?? []).map((r) => toCamel<Membership>(r as unknown as Record<string, unknown>))
    const ids = memberships.map((m) => m.householdId)
    const { data: hRows } = ids.length ? await this.client.from('households').select('*').in('id', ids).is('deleted_at', null) : { data: [] }
    const households: SessionInfo['households'] = []
    for (const m of memberships) {
      const raw = (hRows ?? []).find((h) => h.id === m.householdId)
      if (raw) households.push({ household: toCamel<Household>(raw as unknown as Record<string, unknown>), role: m.role, membership: m })
    }
    households.sort((a, b) => a.household.name.localeCompare(b.household.name))
    const { data: prefs } = await this.client.from('user_prefs').select('active_household_id').eq('user_id', userId).maybeSingle()
    const active = prefs?.active_household_id ?? null
    const activeHouseholdId = households.some((h) => h.household.id === active) ? active : (households[0]?.household.id ?? null)
    const profile: Profile = profileRow
      ? toCamel<Profile>(profileRow as unknown as Record<string, unknown>)
      : { userId, displayName: '', email: null }
    this.ensureChannel(activeHouseholdId)
    return { userId, profile, households, activeHouseholdId }
  }

  async setActiveHousehold(householdId: string): Promise<void> {
    const userId = await this.userId()
    await this.client.from('user_prefs').upsert({ user_id: userId, active_household_id: householdId, updated_at: nowIso() })
    this.ensureChannel(householdId)
    this.emit({ table: 'households', householdId, ids: [householdId], origin: 'local' })
  }

  table<K extends TableName>(name: K): Collection<TableMap[K]> {
    type Row = TableMap[K]
    // The generated Database type is strict per table; this adapter is generic, so it goes through a loose handle.
    const from = () => (this.client as unknown as { from: (t: string) => any }).from(name) // eslint-disable-line @typescript-eslint/no-explicit-any
    const pk = name === 'profiles' ? 'user_id' : 'id'
    const emit = (ids: string[], householdId: string | null) => this.emit({ table: name, householdId, ids, origin: 'local' })
    const hid = (row: unknown): string | null => (row && typeof row === 'object' && 'householdId' in row ? String((row as { householdId: unknown }).householdId) : null)
    const key = (row: unknown): string => {
      const r = row as Record<string, unknown>
      return String(r.id ?? r.userId)
    }
    return {
      list: async (householdId, opts) => {
        let q
        if (name === 'households') {
          q = from().select('*').eq('id', householdId)
        } else if (name === 'profiles') {
          const { data: members, error: mErr } = await this.client.from('memberships').select('user_id').eq('household_id', householdId).is('deleted_at', null)
          if (mErr) throw mErr
          const ids = (members ?? []).map((m) => m.user_id)
          if (ids.length === 0) return []
          q = from().select('*').in('user_id', ids)
        } else {
          q = from().select('*').eq('household_id', householdId)
          if (!opts?.includeDeleted) q = q.is('deleted_at', null)
        }
        const { data, error } = await q
        if (error) throw error
        return (data as Record<string, unknown>[]).map((r) => toCamel<Row>(r))
      },
      get: async (id) => {
        const { data, error } = await from().select('*').eq(pk, id).maybeSingle()
        if (error) throw error
        return data ? toCamel<Row>(data as Record<string, unknown>) : null
      },
      put: async (row) => {
        const { error } = await from().upsert(toSnake(row as unknown as Record<string, unknown>))
        if (error) throw error
        emit([key(row)], hid(row))
        return row
      },
      putMany: async (rows) => {
        if (rows.length === 0) return rows
        const { error } = await from().upsert(rows.map((r) => toSnake(r as unknown as Record<string, unknown>)))
        if (error) throw error
        emit(rows.map(key), hid(rows[0]))
        return rows
      },
      patch: async (id, patch) => {
        const { data, error } = await from().update(toSnake(patch as Record<string, unknown>)).eq(pk, id).select('*').maybeSingle()
        if (error) throw error
        if (!data) return null
        const next = toCamel<Row>(data as Record<string, unknown>)
        emit([id], hid(next))
        return next
      },
      softDelete: async (id) => {
        const { data, error } = await from().update({ deleted_at: nowIso() }).eq(pk, id).select('household_id').maybeSingle()
        if (error) throw error
        emit([id], (data as { household_id?: string } | null)?.household_id ?? null)
      },
      remove: async (id) => {
        const { error } = await from().delete().eq(pk, id)
        if (error) throw error
        emit([id], null)
      },
    }
  }

  subscribe(listener: (e: ChangeEvent) => void): Unsubscribe {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(e: ChangeEvent) {
    for (const l of this.listeners) l(e)
  }

  /** One realtime channel per active household, filtered server side by household_id. */
  private ensureChannel(householdId: string | null) {
    if (householdId === this.channelHousehold) return
    if (this.channel) {
      void this.client.removeChannel(this.channel)
      this.channel = null
    }
    this.channelHousehold = householdId
    if (!householdId) return
    const ch = this.client.channel(`household:${householdId}`)
    for (const table of ['items', 'freezer_blocks', 'list_lines', 'list_sends', 'plan_entries', 'batches', 'recipes', 'activity_events'] as TableName[]) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` }, (payload) => {
        const row = (payload.new ?? payload.old) as Partial<TenantRow> & { id?: string }
        this.emit({ table, householdId, ids: row.id ? [row.id] : [], origin: 'remote' })
      })
    }
    ch.subscribe()
    this.channel = ch
  }

  async createHousehold(input: CreateHouseholdInput): Promise<Household> {
    const { data, error } = await this.client.rpc('create_household', {
      p_name: input.name,
      p_timezone: input.timezone ?? 'America/Chicago',
      p_zip: input.zip ?? undefined,
      p_kit: input.kit ?? 'basic',
    })
    if (error) throw error
    const id = data as string
    const { data: row, error: e2 } = await this.client.from('households').select('*').eq('id', id).single()
    if (e2) throw e2
    this.ensureChannel(id)
    return toCamel<Household>(row as unknown as Record<string, unknown>)
  }

  async createInvite(input: { householdId: string; kind: 'member' | 'household'; email?: string | null; role?: Role; newHouseholdName?: string | null }): Promise<string> {
    const { data, error } = await this.client.rpc('create_invite', {
      p_household_id: input.householdId,
      p_kind: input.kind,
      p_email: input.email ?? undefined,
      p_role: input.role ?? 'editor',
      p_new_household_name: input.newHouseholdName ?? undefined,
    })
    if (error) throw error
    return data as string
  }

  async acceptInvite(token: string): Promise<Household> {
    const { data, error } = await this.client.rpc('accept_invite', { p_token: token })
    if (error) throw error
    const { data: row, error: e2 } = await this.client.from('households').select('*').eq('id', data as string).single()
    if (e2) throw e2
    return toCamel<Household>(row as unknown as Record<string, unknown>)
  }

  async uploadImage(householdId: string, bucket: 'receipts' | 'images', file: Blob): Promise<string> {
    const path = `${householdId}/${crypto.randomUUID()}.jpg`
    const { error } = await this.client.storage.from(bucket).upload(path, file, { contentType: file.type || 'image/jpeg' })
    if (error) throw error
    return path
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut()
  }
}
