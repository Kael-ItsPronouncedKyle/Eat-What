import type { Household, Membership, Profile, Role, TenantRow } from '@/domain/types'
import { newId } from '@/domain/ids'
import { QmDatabase } from './db'
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
import { seedHouseholdDefaults } from '../seed/defaults'

export const DEMO_USER_ID = 'local-demo-user'

/** Runs the whole app with no backend: IndexedDB in the browser, fake-indexeddb in tests. */
export class LocalRepository implements Repository {
  readonly mode = 'local' as const
  readonly db: QmDatabase
  private listeners = new Set<(e: ChangeEvent) => void>()
  private userId: string

  constructor(opts: { db?: QmDatabase; userId?: string } = {}) {
    this.db = opts.db ?? new QmDatabase()
    this.userId = opts.userId ?? DEMO_USER_ID
  }

  async session(): Promise<SessionInfo> {
    let profile = await this.db.profiles.get(this.userId)
    if (!profile) {
      profile = { userId: this.userId, displayName: 'You', email: null }
      await this.db.profiles.put(profile)
    }
    const memberships = (await this.db.memberships.where('userId').equals(this.userId).toArray()).filter((m) => !m.deletedAt)
    const households: SessionInfo['households'] = []
    for (const m of memberships) {
      const h = await this.db.households.get(m.householdId)
      if (h && !h.deletedAt) households.push({ household: h, role: m.role, membership: m })
    }
    households.sort((a, b) => a.household.name.localeCompare(b.household.name))
    const active = (await this.db.meta.get('activeHouseholdId'))?.value as string | undefined
    const activeHouseholdId = households.some((h) => h.household.id === active) ? active! : (households[0]?.household.id ?? null)
    return { userId: this.userId, profile, households, activeHouseholdId }
  }

  async setActiveHousehold(householdId: string): Promise<void> {
    await this.db.meta.put({ key: 'activeHouseholdId', value: householdId })
    this.emit({ table: 'households', householdId, ids: [householdId], origin: 'local' })
  }

  table<K extends TableName>(name: K): Collection<TableMap[K]> {
    const store = this.db.store(name)
    const emit = (ids: string[], householdId: string | null) => this.emit({ table: name, householdId, ids, origin: 'local' })
    const hid = (row: unknown): string | null => (row && typeof row === 'object' && 'householdId' in row ? String((row as { householdId: unknown }).householdId) : null)
    const key = (row: unknown): string => {
      const r = row as Record<string, unknown>
      return String(r.id ?? r.userId)
    }
    return {
      list: async (householdId, opts) => {
        let rows: TableMap[K][]
        if (name === 'households') {
          const h = await this.db.households.get(householdId)
          rows = (h ? [h] : []) as TableMap[K][]
        } else if (name === 'profiles') {
          const members = (await this.db.memberships.where('householdId').equals(householdId).toArray()).filter((m) => !m.deletedAt)
          rows = (await this.db.profiles.bulkGet(members.map((m) => m.userId))).filter((p): p is TableMap['profiles'] => !!p) as TableMap[K][]
        } else {
          rows = await store.where('householdId').equals(householdId).toArray()
        }
        return opts?.includeDeleted ? rows : rows.filter((r) => !(r as Partial<TenantRow>).deletedAt)
      },
      get: async (id) => (await store.get(id)) ?? null,
      put: async (row) => {
        await store.put(row)
        emit([key(row)], hid(row))
        return row
      },
      putMany: async (rows) => {
        if (rows.length === 0) return rows
        await store.bulkPut(rows)
        emit(rows.map(key), hid(rows[0]))
        return rows
      },
      patch: async (id, patch) => {
        const existing = await store.get(id)
        if (!existing) return null
        const next = { ...existing, ...patch } as TableMap[K]
        if ('updatedAt' in (next as object)) (next as unknown as TenantRow).updatedAt = nowIso()
        await store.put(next)
        emit([id], hid(next))
        return next
      },
      softDelete: async (id) => {
        const existing = await store.get(id)
        if (!existing) return
        const next = { ...existing, deletedAt: nowIso(), updatedAt: nowIso() }
        await store.put(next as TableMap[K])
        emit([id], hid(next))
      },
      remove: async (id) => {
        const existing = await store.get(id)
        await store.delete(id)
        emit([id], hid(existing))
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

  async createHousehold(input: CreateHouseholdInput): Promise<Household> {
    const now = nowIso()
    const household: Household = {
      id: newId(),
      name: input.name,
      timezone: input.timezone ?? 'America/Chicago',
      zip: input.zip ?? null,
      currency: 'USD',
      budgetMonthlyCents: null,
      budgetWarnPct: 80,
      quietFrom: null,
      quietTo: null,
      settings: { freezerKit: input.kit ?? 'basic' },
      createdBy: this.userId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    const membership: Membership = {
      id: newId(),
      householdId: household.id,
      userId: this.userId,
      role: 'owner',
      personId: null,
      energyLevel: null,
      energySetOn: null,
      createdAt: now,
      deletedAt: null,
    }
    await this.db.households.put(household)
    await this.db.memberships.put(membership)
    const profile = (await this.db.profiles.get(this.userId)) as Profile | undefined
    await seedHouseholdDefaults(this, household.id, { kit: input.kit ?? 'basic', ownerUserId: this.userId, ownerName: profile?.displayName ?? 'Me' })
    await this.setActiveHousehold(household.id)
    return household
  }

  async createInvite(input: { householdId: string; kind: 'member' | 'household'; email?: string | null; role?: Role; newHouseholdName?: string | null }): Promise<string> {
    const token = newId().replace(/-/g, '')
    await this.db.invites.put({
      id: newId(),
      householdId: input.householdId,
      kind: input.kind,
      email: input.email ?? null,
      role: input.role ?? 'editor',
      newHouseholdName: input.newHouseholdName ?? null,
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      maxUses: 1,
      usedCount: 0,
      createdBy: this.userId,
      acceptedBy: null,
      acceptedAt: null,
      createdAt: nowIso(),
    })
    await this.db.meta.put({ key: `invite:${token}`, value: input })
    return token
  }

  async acceptInvite(token: string): Promise<Household> {
    const stored = await this.db.meta.get(`invite:${token}`)
    if (!stored) throw new Error('That invite link is not valid.')
    const input = stored.value as { householdId: string; kind: 'member' | 'household'; role?: Role; newHouseholdName?: string | null }
    if (input.kind === 'household') {
      return this.createHousehold({ name: input.newHouseholdName ?? 'New household' })
    }
    const h = await this.db.households.get(input.householdId)
    if (!h) throw new Error('That household no longer exists.')
    await this.db.memberships.put({
      id: newId(),
      householdId: h.id,
      userId: this.userId,
      role: input.role ?? 'editor',
      personId: null,
      energyLevel: null,
      energySetOn: null,
      createdAt: nowIso(),
      deletedAt: null,
    })
    await this.db.meta.delete(`invite:${token}`)
    return h
  }

  async uploadImage(_householdId: string, _bucket: 'receipts' | 'images', file: Blob): Promise<string> {
    return URL.createObjectURL(file)
  }

  async signOut(): Promise<void> {
    /* nothing to do locally */
  }

  async reset(): Promise<void> {
    await this.db.delete()
    await this.db.open()
  }
}
