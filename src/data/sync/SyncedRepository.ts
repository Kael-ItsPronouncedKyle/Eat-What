import type { Household, Role } from '@/domain/types'
import { newId } from '@/domain/ids'
import { QmDatabase, type OutboxOp } from '../local/db'
import { applyCounterDelta } from '../local/LocalRepository'
import { hasApplyOps, type ApplyOp } from '../supabase/SupabaseRepository'
import {
  nowIso,
  TENANT_TABLES,
  type ChangeEvent,
  type Collection,
  type CreateHouseholdInput,
  type Repository,
  type SessionInfo,
  type SyncStatus,
  type TableMap,
  type TableName,
  type Unsubscribe,
} from '../repository'

/** Tables the mirror holds per household. Non-tenant tables (profiles, memberships, households, user prefs) are read through. */
const MIRRORED: TableName[] = [...TENANT_TABLES, 'activity_events', 'receipt_lines', 'invites', 'notification_prefs']

type AnyRow = Record<string, unknown> & { id?: string; userId?: string; householdId?: string; updatedAt?: string; deletedAt?: string | null }

const keyOf = (row: AnyRow): string => String(row.id ?? row.userId)

/** Cache-through repository: reads come from IndexedDB, writes apply there first and queue in an outbox that flushes to the
    remote when online. Remote changes (realtime or a pull) update the mirror. Last write wins per field: existing rows are
    sent as patches of changed columns, never whole rows, so two phones editing different fields both keep their change. */
export class SyncedRepository implements Repository {
  readonly mode = 'supabase' as const
  readonly db: QmDatabase
  private readonly remote: Repository
  private listeners = new Set<(e: ChangeEvent) => void>()
  private statusListeners = new Set<(s: SyncStatus) => void>()
  private status: SyncStatus = { pending: 0, online: true, flushing: false, lastPullAt: null, lastError: null }
  private flushPromise: Promise<void> | null = null
  private flushQueued: Promise<void> | null = null
  private pulled = new Set<string>()
  private seq: number | null = null
  private pulling = new Map<string, Promise<void>>()
  private detach: (() => void)[] = []
  private isOnline: () => boolean

  constructor(remote: Repository, opts: { db?: QmDatabase; isOnline?: () => boolean; listen?: boolean } = {}) {
    this.remote = remote
    this.db = opts.db ?? new QmDatabase('quartermaster-sync')
    this.isOnline = opts.isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine))
    this.detach.push(remote.subscribe((e) => void this.onRemoteChange(e)))
    if (opts.listen !== false && typeof window !== 'undefined') {
      const onOnline = () => void this.syncNow()
      const onVisible = () => {
        if (document.visibilityState === 'visible') void this.syncNow()
      }
      window.addEventListener('online', onOnline)
      document.addEventListener('visibilitychange', onVisible)
      this.detach.push(() => window.removeEventListener('online', onOnline), () => document.removeEventListener('visibilitychange', onVisible))
    }
    void this.refreshPending()
  }

  dispose(): void {
    for (const d of this.detach) d()
  }

  /* ---- session (read-through with an offline fallback) ---- */

  async session(): Promise<SessionInfo> {
    try {
      const info = await this.remote.session()
      await this.db.meta.put({ key: 'session', value: info })
      if (info.activeHouseholdId) void this.pull(info.activeHouseholdId)
      return info
    } catch (e) {
      const cached = (await this.db.meta.get('session'))?.value as SessionInfo | undefined
      if (cached) return cached
      throw e
    }
  }

  async setActiveHousehold(householdId: string): Promise<void> {
    const cached = (await this.db.meta.get('session'))?.value as SessionInfo | undefined
    if (cached) await this.db.meta.put({ key: 'session', value: { ...cached, activeHouseholdId: householdId } })
    try {
      await this.remote.setActiveHousehold(householdId)
    } catch {
      /* applied on the next successful session() */
    }
    void this.pull(householdId)
    this.emit({ table: 'households', householdId, ids: [householdId], origin: 'local' })
  }

  /* ---- collections ---- */

  table<K extends TableName>(name: K): Collection<TableMap[K]> {
    if (!MIRRORED.includes(name)) return this.remote.table(name)
    const store = this.db.store(name)
    const emit = (ids: string[], householdId: string | null) => this.emit({ table: name, householdId, ids, origin: 'local' })
    const hid = (row: unknown) => ((row as unknown as AnyRow)?.householdId ? String((row as unknown as AnyRow).householdId) : null)
    return {
      list: async (householdId, opts) => {
        if (!this.pulled.has(householdId)) await this.pull(householdId)
        const rows = (await store.where('householdId').equals(householdId).toArray()) as unknown as AnyRow[]
        return (opts?.includeDeleted ? rows : rows.filter((r) => !r.deletedAt)) as unknown as TableMap[K][]
      },
      get: async (id) => ((await store.get(id)) as TableMap[K] | undefined) ?? null,
      put: async (row) => {
        await this.write(name, row as unknown as AnyRow)
        emit([keyOf(row as unknown as AnyRow)], hid(row))
        return row
      },
      putMany: async (rows) => {
        for (const r of rows) await this.write(name, r as unknown as AnyRow)
        if (rows.length) emit(rows.map((r) => keyOf(r as unknown as AnyRow)), hid(rows[0]))
        return rows
      },
      patch: async (id, patch) => {
        const existing = (await store.get(id)) as unknown as AnyRow | undefined
        if (!existing) return null
        // Only rows that carry updatedAt get a new stamp: activity_events has created_at alone, and the server rejects unknown columns.
        const stamp: Partial<AnyRow> = 'updatedAt' in existing ? { updatedAt: nowIso() } : {}
        const next: AnyRow = { ...existing, ...(patch as unknown as AnyRow), ...stamp }
        await store.put(next as unknown as TableMap[K])
        await this.enqueue({ householdId: hid(next), table: name, rowId: id, kind: 'patch', payload: { ...(patch as unknown as AnyRow), ...stamp } })
        emit([id], hid(next))
        return next as unknown as TableMap[K]
      },
      softDelete: async (id) => {
        const existing = (await store.get(id)) as unknown as AnyRow | undefined
        if (!existing) return
        const now = nowIso()
        const stamp: Partial<AnyRow> = 'updatedAt' in existing ? { updatedAt: now } : {}
        await store.put({ ...existing, deletedAt: now, ...stamp } as TableMap[K])
        await this.enqueue({ householdId: hid(existing), table: name, rowId: id, kind: 'softDelete', payload: null })
        emit([id], hid(existing))
      },
      remove: async (id) => {
        const existing = (await store.get(id)) as unknown as AnyRow | undefined
        await store.delete(id)
        await this.enqueue({ householdId: hid(existing), table: name, rowId: id, kind: 'remove', payload: null })
        emit([id], hid(existing))
      },
      // Counter change: applied to the mirror now, replayed on the server as a delta (not a value), so two phones that
      // each ate one block offline both land. `base` is what this phone saw; the server notes a mismatch, never a loss.
      adjust: async (id, field, delta, opts) => {
        const existing = (await store.get(id)) as unknown as AnyRow | undefined
        if (!existing) return null
        const seen = existing[field]
        const base = opts?.base ?? (typeof seen === 'number' && Number.isFinite(seen) ? seen : 0)
        const stamp: Partial<AnyRow> = 'updatedAt' in existing ? { updatedAt: nowIso() } : {}
        const next: AnyRow = { ...applyCounterDelta(name, existing, field, delta), ...stamp }
        await store.put(next as unknown as TableMap[K])
        await this.enqueue({ householdId: hid(next), table: name, rowId: id, kind: 'delta', payload: { field, delta, base } })
        emit([id], hid(next))
        return next as unknown as TableMap[K]
      },
    }
  }

  /** Insert or update in the mirror; queue a full row for new rows and a patch of changed columns for existing ones. */
  private async write(name: TableName, row: AnyRow): Promise<void> {
    const store = this.db.store(name)
    const key = keyOf(row)
    const existing = (await store.get(key)) as unknown as AnyRow | undefined
    const next = { ...row, updatedAt: 'updatedAt' in row ? nowIso() : row.updatedAt }
    await store.put(next as never)
    if (!existing) {
      await this.enqueue({ householdId: row.householdId ? String(row.householdId) : null, table: name, rowId: key, kind: 'put', payload: next })
      return
    }
    const patch: AnyRow = {}
    for (const [k, v] of Object.entries(next)) {
      if (k === 'createdAt' || k === 'createdBy') continue
      if (JSON.stringify(existing[k]) !== JSON.stringify(v)) patch[k] = v
    }
    delete patch.updatedAt
    if (Object.keys(patch).length === 0) return
    patch.updatedAt = next.updatedAt
    await this.enqueue({ householdId: row.householdId ? String(row.householdId) : null, table: name, rowId: key, kind: 'patch', payload: patch })
  }

  /* ---- outbox ---- */

  private async enqueue(op: Omit<OutboxOp, 'id' | 'createdAt' | 'attempts' | 'lastError' | 'seq'>): Promise<void> {
    if (this.seq === null) this.seq = (await this.db.outbox.toArray()).reduce((m, o) => Math.max(m, o.seq ?? 0), 0)
    this.seq += 1
    await this.db.outbox.put({ ...op, id: newId(), createdAt: nowIso(), seq: this.seq, attempts: 0, lastError: null })
    await this.refreshPending()
    void this.flush()
  }

  private pendingGen = 0

  /** Re-count the outbox. A slow count started earlier (the constructor's, say) must not overwrite a newer one. */
  private async refreshPending(): Promise<void> {
    const gen = ++this.pendingGen
    const pending = await this.db.outbox.count()
    if (gen === this.pendingGen) this.setStatus({ pending })
  }

  /** Drain the outbox in order. Stops at the first network failure; drops an op the server rejects (logged as lastError).
      When the remote can take a batch (apply_ops), consecutive patch, delta and tombstone ops for one household go as
      one call; puts and hard deletes, and every op on a remote without apply_ops, go one at a time. */
  flush(): Promise<void> {
    if (this.flushPromise) {
      // A pass is running (it may have found us offline a moment ago): run one more after it, shared by every caller.
      this.flushQueued ??= this.flushPromise.then(() => {
        this.flushQueued = null
        return this.flush()
      })
      return this.flushQueued
    }
    this.flushPromise = (async () => {
      try {
        if (!this.isOnline()) {
          this.setStatus({ online: false })
          return
        }
        this.setStatus({ online: true, flushing: true })
        // Several ops can share a millisecond; seq keeps them in the order they were made.
        const ops = (await this.db.outbox.toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.seq ?? 0) - (b.seq ?? 0))
        const batching = hasApplyOps(this.remote)
        let i = 0
        while (i < ops.length) {
          const op = ops[i]!
          if (batching && isBatchable(op)) {
            let j = i + 1
            while (j < ops.length && isBatchable(ops[j]!) && ops[j]!.householdId === op.householdId) j++
            if (await this.flushRun(ops.slice(i, j))) break
            i = j
          } else {
            if (await this.flushOne(op)) break
            i++
          }
        }
      } finally {
        this.setStatus({ flushing: false })
        await this.refreshPending()
        this.flushPromise = null
      }
    })()
    return this.flushPromise
  }

  /** Apply one op. Returns true when the flush must stop (network gone). */
  private async flushOne(op: OutboxOp): Promise<boolean> {
    try {
      await this.apply(op)
      await this.db.outbox.delete(op.id)
      this.setStatus({ lastError: null })
      return false
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (isNetworkError(e)) {
        this.setStatus({ online: false, lastError: msg })
        return true
      }
      // Rejected by the server (RLS, constraint): drop it so the queue does not jam, and keep the message.
      await this.db.outbox.delete(op.id)
      this.setStatus({ lastError: `${op.table}: ${msg}` })
      return false
    }
  }

  /** Send a run of ops as one apply_ops call. A per-op rejection drops that op; a failed call that is not the network
      falls back to one-at-a-time so an older server never jams the queue. Returns true when the flush must stop. */
  private async flushRun(run: OutboxOp[]): Promise<boolean> {
    if (!hasApplyOps(this.remote)) return false
    let results
    try {
      results = await this.remote.applyOps(run.map(toApplyOp))
    } catch (e) {
      if (isNetworkError(e)) {
        this.setStatus({ online: false, lastError: e instanceof Error ? e.message : String(e) })
        return true
      }
      for (const op of run) if (await this.flushOne(op)) return true
      return false
    }
    for (let k = 0; k < run.length; k++) {
      const op = run[k]!
      const r = results[k]
      await this.db.outbox.delete(op.id)
      if (r?.ok) this.setStatus({ lastError: null })
      else this.setStatus({ lastError: `${op.table}: ${r?.error ?? 'no result from the server'}` })
    }
    return false
  }

  private async apply(op: OutboxOp): Promise<void> {
    const col = this.remote.table(op.table) as unknown as Collection<AnyRow>
    if (op.kind === 'put') await col.put(op.payload as unknown as AnyRow)
    else if (op.kind === 'patch') await col.patch(op.rowId, op.payload as Partial<AnyRow>)
    else if (op.kind === 'softDelete') await col.softDelete(op.rowId)
    else if (op.kind === 'delta') {
      const { field, delta, base } = op.payload as DeltaPayload
      if (col.adjust) await col.adjust(op.rowId, field, delta, { base })
      // A remote with no delta op gets the value this phone computed (last write wins, the old behaviour).
      else await col.patch(op.rowId, { [field]: Math.max(0, (base ?? 0) + delta) } as Partial<AnyRow>)
    } else await col.remove(op.rowId)
  }

  /* ---- pull ---- */

  /** Full pull of one household's mirrored tables. Rows with a queued local change are not overwritten.
      Concurrent callers share one in-flight pull per household, so twenty first reads cost one round of requests. */
  pull(householdId: string): Promise<void> {
    const inFlight = this.pulling.get(householdId)
    if (inFlight) return inFlight
    const run = this.doPull(householdId).finally(() => {
      this.pulling.delete(householdId)
    })
    this.pulling.set(householdId, run)
    return run
  }

  private async doPull(householdId: string): Promise<void> {
    if (!this.isOnline()) {
      this.pulled.add(householdId)
      return
    }
    try {
      const pendingIds = new Set((await this.db.outbox.where('householdId').equals(householdId).toArray()).map((o) => `${o.table}:${o.rowId}`))
      const touched: TableName[] = []
      for (const name of MIRRORED) {
        const remoteRows = (await this.remote.table(name).list(householdId, { includeDeleted: true })) as unknown as AnyRow[]
        const store = this.db.store(name)
        const localRows = (await store.where('householdId').equals(householdId).toArray()) as unknown as AnyRow[]
        const localById = new Map(localRows.map((r) => [keyOf(r), r] as const))
        const toPut: AnyRow[] = []
        for (const r of remoteRows) {
          const key = keyOf(r)
          if (pendingIds.has(`${name}:${key}`)) continue
          const local = localById.get(key)
          if (!local) toPut.push(r)
          else {
            const remoteStamp = r.updatedAt ?? ''
            const localStamp = local.updatedAt ?? ''
            // Newer wins; an equal stamp (or none, as on activity_events) is re-put only when the row actually differs,
            // so a repeat pull does not announce changes that did not happen.
            if (remoteStamp > localStamp || (remoteStamp === localStamp && JSON.stringify(r) !== JSON.stringify(local))) toPut.push(r)
          }
        }
        const remoteIds = new Set(remoteRows.map(keyOf))
        const toDelete = localRows.filter((r) => !remoteIds.has(keyOf(r)) && !pendingIds.has(`${name}:${keyOf(r)}`)).map(keyOf)
        if (toPut.length) await store.bulkPut(toPut as never[])
        if (toDelete.length) await store.bulkDelete(toDelete)
        if (toPut.length || toDelete.length) touched.push(name)
      }
      this.pulled.add(householdId)
      this.setStatus({ online: true, lastPullAt: nowIso(), lastError: null })
      for (const name of touched) this.emit({ table: name, householdId, ids: [], origin: 'remote' })
    } catch (e) {
      this.pulled.add(householdId)
      this.setStatus({ online: !isNetworkError(e), lastError: e instanceof Error ? e.message : String(e) })
    }
  }

  private async onRemoteChange(e: ChangeEvent): Promise<void> {
    if (e.origin !== 'remote' || !MIRRORED.includes(e.table)) return
    try {
      const col = this.remote.table(e.table) as unknown as Collection<AnyRow>
      const store = this.db.store(e.table)
      const pending = new Set((await this.db.outbox.toArray()).map((o) => `${o.table}:${o.rowId}`))
      for (const id of e.ids) {
        if (pending.has(`${e.table}:${id}`)) continue
        const row = await col.get(id)
        if (row) await store.put(row as never)
        else await store.delete(id)
      }
      this.emit({ table: e.table, householdId: e.householdId, ids: e.ids, origin: 'remote' })
    } catch {
      /* the next pull catches up */
    }
  }

  async syncNow(): Promise<void> {
    await this.flush()
    for (const hid of [...this.pulled]) await this.pull(hid)
  }

  /* ---- events and status ---- */

  subscribe(listener: (e: ChangeEvent) => void): Unsubscribe {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(e: ChangeEvent) {
    for (const l of this.listeners) l(e)
  }

  syncStatus(): SyncStatus {
    return this.status
  }

  onSyncStatus(listener: (s: SyncStatus) => void): Unsubscribe {
    this.statusListeners.add(listener)
    listener(this.status)
    return () => this.statusListeners.delete(listener)
  }

  private setStatus(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch }
    for (const l of this.statusListeners) l(this.status)
  }

  /* ---- pass-through RPCs (need the network) ---- */

  async createHousehold(input: CreateHouseholdInput): Promise<Household> {
    const h = await this.remote.createHousehold(input)
    await this.db.meta.delete('session')
    await this.pull(h.id)
    return h
  }
  createInvite(input: { householdId: string; kind: 'member' | 'household'; email?: string | null; role?: Role; newHouseholdName?: string | null }): Promise<string> {
    return this.remote.createInvite(input)
  }
  async acceptInvite(token: string): Promise<Household> {
    const h = await this.remote.acceptInvite(token)
    await this.db.meta.delete('session')
    await this.pull(h.id)
    return h
  }
  uploadImage(householdId: string, bucket: 'receipts' | 'images', file: Blob): Promise<string> {
    return this.remote.uploadImage(householdId, bucket, file)
  }
  async signOut(): Promise<void> {
    await this.flush().catch(() => undefined)
    await this.remote.signOut()
    await this.db.delete()
    await this.db.open()
    this.pulled.clear()
  }
}

interface DeltaPayload {
  field: string
  delta: number
  base: number | null
}

const BATCHABLE = new Set<OutboxOp['kind']>(['patch', 'delta', 'softDelete'])

function isBatchable(op: OutboxOp): boolean {
  return BATCHABLE.has(op.kind)
}

function toApplyOp(op: OutboxOp): ApplyOp {
  if (op.kind === 'delta') {
    const { field, delta, base } = op.payload as DeltaPayload
    return { table: op.table, id: op.rowId, kind: 'delta', payload: { field, delta }, base }
  }
  if (op.kind === 'patch') return { table: op.table, id: op.rowId, kind: 'patch', payload: op.payload as Record<string, unknown> }
  return { table: op.table, id: op.rowId, kind: 'softDelete', payload: null }
}

function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /network|fetch|offline|Failed to fetch|ECONN|timeout|load failed/i.test(msg) || (typeof navigator !== 'undefined' && !navigator.onLine)
}


