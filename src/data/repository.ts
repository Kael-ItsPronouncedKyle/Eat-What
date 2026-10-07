/* The one boundary between the app and storage (spec build rule: nothing depends on Supabase beyond auth and RLS).
   Two adapters implement it: LocalRepository (IndexedDB, no backend, also the offline mirror) and SupabaseRepository. */

import type {
  ActivityEvent, Batch, Container, CookSession, CookWeek, FreezerBlock, Household, Invite, Item, ItemAlias, ItemRetailerLink,
  ListLine, ListSend, Location, Membership, NotificationPref, PartnerTurn, PlanEntry, Price, Profile, Receipt, ReceiptLine, Recipe,
  RecipeIngredient, Retailer, Role, RoutingRule, Rule, Person, Spend, TenantRow,
} from '@/domain/types'

export interface TableMap {
  households: Household
  memberships: Membership
  profiles: Profile
  persons: Person
  rules: Rule
  locations: Location
  containers: Container
  items: Item
  item_aliases: ItemAlias
  item_retailer_links: ItemRetailerLink
  recipes: Recipe
  recipe_ingredients: RecipeIngredient
  cook_weeks: CookWeek
  batches: Batch
  freezer_blocks: FreezerBlock
  plan_entries: PlanEntry
  cook_sessions: CookSession
  retailers: Retailer
  routing_rules: RoutingRule
  list_lines: ListLine
  list_sends: ListSend
  receipts: Receipt
  receipt_lines: ReceiptLine
  prices: Price
  spend: Spend
  partner_turns: PartnerTurn
  activity_events: ActivityEvent
  invites: Invite
  notification_prefs: NotificationPref
}

export type TableName = keyof TableMap

/** Tables scoped by household_id with the standard audit columns. */
export type TenantTable = {
  [K in TableName]: TableMap[K] extends TenantRow ? K : never
}[TableName]

export const TENANT_TABLES: TenantTable[] = [
  'persons', 'rules', 'locations', 'containers', 'items', 'item_aliases', 'item_retailer_links', 'recipes', 'recipe_ingredients',
  'cook_weeks', 'batches', 'freezer_blocks', 'plan_entries', 'cook_sessions', 'retailers', 'routing_rules', 'list_lines', 'list_sends',
  'receipts', 'prices', 'spend', 'partner_turns',
]

export interface SessionInfo {
  userId: string
  profile: Profile
  households: { household: Household; role: Role; membership: Membership }[]
  activeHouseholdId: string | null
}

export interface ChangeEvent {
  table: TableName
  householdId: string | null
  ids: string[]
  /** Where the change came from; 'remote' means another device or member. */
  origin: 'local' | 'remote'
}

export type Unsubscribe = () => void

export interface Collection<T> {
  /** Rows for a household, tombstones excluded unless includeDeleted. */
  list(householdId: string, opts?: { includeDeleted?: boolean }): Promise<T[]>
  get(id: string): Promise<T | null>
  /** Insert or replace a full row. */
  put(row: T): Promise<T>
  putMany(rows: T[]): Promise<T[]>
  /** Partial update; sets updatedAt. Returns the new row or null when missing. */
  patch(id: string, patch: Partial<T>): Promise<T | null>
  /** Tombstone (sets deletedAt) so offline mirrors learn about it. */
  softDelete(id: string): Promise<void>
  /** Hard delete; used for undo of an insert and for non-tenant tables. */
  remove(id: string): Promise<void>
}

export interface CreateHouseholdInput {
  name: string
  timezone?: string
  zip?: string | null
  kit?: 'souper_cubes' | 'cheapest' | 'basic'
}

export interface Repository {
  readonly mode: 'local' | 'supabase'
  /** Resolve the signed-in user and their households. Local mode returns the demo user. */
  session(): Promise<SessionInfo>
  setActiveHousehold(householdId: string): Promise<void>
  table<K extends TableName>(name: K): Collection<TableMap[K]>
  /** Notified after any write (local) or any realtime change (remote). */
  subscribe(listener: (e: ChangeEvent) => void): Unsubscribe
  /** RPCs that cross the tenancy bootstrap (create_household, invites). */
  createHousehold(input: CreateHouseholdInput): Promise<Household>
  createInvite(input: { householdId: string; kind: 'member' | 'household'; email?: string | null; role?: Role; newHouseholdName?: string | null }): Promise<string>
  acceptInvite(token: string): Promise<Household>
  /** Upload a receipt or image; returns the storage path. Local mode keeps a blob URL. */
  uploadImage(householdId: string, bucket: 'receipts' | 'images', file: Blob): Promise<string>
  /** Sign out (no-op locally). */
  signOut(): Promise<void>
  /** Wipe local data (demo reset). */
  reset?(): Promise<void>
  /** Offline queue status, when the adapter has one. */
  syncStatus?(): SyncStatus
  onSyncStatus?(listener: (s: SyncStatus) => void): Unsubscribe
  /** Force a flush and pull now (pull-to-refresh, "retry" tap). */
  syncNow?(): Promise<void>
}

export interface SyncStatus {
  pending: number
  online: boolean
  flushing: boolean
  lastPullAt: string | null
  lastError: string | null
}

/** Helper for adapters: generate a fresh ISO timestamp. */
export const nowIso = () => new Date().toISOString()
