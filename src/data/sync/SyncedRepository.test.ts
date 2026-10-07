import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LocalRepository } from '../local/LocalRepository'
import { QmDatabase } from '../local/db'
import { ensureDemoSeed } from '../seed/demo'
import { SyncedRepository } from './SyncedRepository'
import { adjustItemQty, eatFreezerBlock, logEvent } from '../mutations'
import type { Collection } from '../repository'
import type { ApplyOp, ApplyOpResult } from '../supabase/SupabaseRepository'

let n = 0

describe('SyncedRepository (offline mirror + outbox)', () => {
  let remote: LocalRepository
  let online: boolean
  let synced: SyncedRepository

  beforeEach(async () => {
    remote = new LocalRepository({ db: new QmDatabase(`remote-${++n}-${Date.now()}`) })
    await ensureDemoSeed(remote)
    online = true
    synced = new SyncedRepository(remote, { db: new QmDatabase(`mirror-${n}-${Date.now()}`), isOnline: () => online, listen: false })
  })

  it('pulls the household into the mirror on first read', async () => {
    const s = await synced.session()
    const hid = s.activeHouseholdId!
    const items = await synced.table('items').list(hid)
    const remoteItems = await remote.table('items').list(hid)
    expect(items.length).toBe(remoteItems.length)
    expect(synced.syncStatus().lastPullAt).not.toBeNull()
  })

  it('writes land locally first and reach the remote after a flush', async () => {
    const s = await synced.session()
    const hid = s.activeHouseholdId!
    // Rows list in id order, which is random per seed; pick one the write will actually change.
    const item = (await synced.table('items').list(hid)).find((x) => x.status !== 'out')!
    online = false
    await synced.table('items').put({ ...item, status: 'out' })
    expect((await synced.table('items').get(item.id))!.status).toBe('out')
    expect((await remote.table('items').get(item.id))!.status).toBe(item.status)
    expect(synced.syncStatus().pending).toBe(1)
    expect(synced.syncStatus().online).toBe(false)
    online = true
    await synced.flush()
    expect(synced.syncStatus().pending).toBe(0)
    expect((await remote.table('items').get(item.id))!.status).toBe('out')
  })

  it('sends patches, so two phones editing different fields both keep their change', async () => {
    const s = await synced.session()
    const hid = s.activeHouseholdId!
    const item = (await synced.table('items').list(hid))[0]!
    online = false
    await synced.table('items').put({ ...item, notes: 'phone A note' })
    // Phone B changes a different field on the remote meanwhile.
    await remote.table('items').patch(item.id, { useBy: '2030-01-01' })
    online = true
    await synced.flush()
    const after = (await remote.table('items').get(item.id))!
    expect(after.notes).toBe('phone A note')
    expect(after.useBy).toBe('2030-01-01')
  })

  it('a pull never overwrites a row with a queued local change, and picks up remote changes otherwise', async () => {
    const s = await synced.session()
    const hid = s.activeHouseholdId!
    const [a, b] = await synced.table('items').list(hid)
    online = false
    await synced.table('items').patch(a!.id, { status: 'low' })
    await remote.table('items').patch(a!.id, { status: 'out' })
    await remote.table('items').patch(b!.id, { status: 'out' })
    online = true
    await synced.pull(hid)
    expect((await synced.table('items').get(a!.id))!.status).toBe('low')
    expect((await synced.table('items').get(b!.id))!.status).toBe('out')
    await synced.flush()
    expect((await remote.table('items').get(a!.id))!.status).toBe('low')
  })

  it('remote change events update the mirror', async () => {
    const s = await synced.session()
    const hid = s.activeHouseholdId!
    const item = (await synced.table('items').list(hid))[0]!
    const seen: string[] = []
    synced.subscribe((e) => seen.push(`${e.origin}:${e.table}`))
    await remote.table('items').patch(item.id, { name: 'Renamed elsewhere' })
    // Simulate the realtime channel.
    ;(remote as unknown as { emit: (e: unknown) => void }).emit({ table: 'items', householdId: hid, ids: [item.id], origin: 'remote' })
    await new Promise((r) => setTimeout(r, 50))
    expect((await synced.table('items').get(item.id))!.name).toBe('Renamed elsewhere')
    expect(seen).toContain('remote:items')
  })

  it('soft deletes queue and propagate; a rejected op is dropped with the error kept', async () => {
    const s = await synced.session()
    const hid = s.activeHouseholdId!
    const item = (await synced.table('items').list(hid))[0]!
    online = false
    await synced.table('items').softDelete(item.id)
    expect((await synced.table('items').list(hid)).some((i) => i.id === item.id)).toBe(false)
    online = true
    await synced.flush()
    expect((await remote.table('items').get(item.id))!.deletedAt).not.toBeNull()
    // A server rejection (simulated by a remote that throws) is dropped, not retried forever.
    const original = remote.table.bind(remote)
    ;(remote as unknown as { table: unknown }).table = ((name: string) => {
      const col = original(name as never)
      return { ...col, patch: async () => { throw new Error('new row violates row-level security policy') } }
    }) as never
    await synced.table('items').patch((await synced.table('items').list(hid))[0]!.id, { notes: 'x' })
    await synced.flush()
    expect(synced.syncStatus().pending).toBe(0)
    expect(synced.syncStatus().lastError).toContain('row-level security')
  })

  it('patching a row that has no updatedAt (an activity event) sends no stamp, so an undo is not rejected', async () => {
    const s = await synced.session()
    const hid = s.activeHouseholdId!
    const event = await logEvent(remote, hid, { userId: s.userId, source: 'tap' }, { entityType: 'items', entityId: null, action: 'status', summary: 'Eggs: Low' })
    await synced.pull(hid)
    const sent: Record<string, unknown>[] = []
    const original = remote.table.bind(remote)
    ;(remote as unknown as { table: unknown }).table = ((name: string) => {
      const col = original(name as never)
      if (name !== 'activity_events') return col
      return { ...col, patch: async (id: string, patch: Record<string, unknown>) => { sent.push(patch); return col.patch(id, patch as never) } }
    }) as never
    await synced.table('activity_events').patch(event.id, { undoneByEventId: 'undo-1' })
    await synced.flush()
    expect(synced.syncStatus().lastError).toBeNull()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toEqual({ undoneByEventId: 'undo-1' })
    expect((await remote.table('activity_events').get(event.id))!.undoneByEventId).toBe('undo-1')
  })

  it('concurrent first reads share one pull, and a repeat pull with nothing new announces nothing', async () => {
    const s = await synced.session()
    const hid = s.activeHouseholdId!
    const spy = vi.spyOn(synced as unknown as { doPull: (h: string) => Promise<void> }, 'doPull')
    await Promise.all([synced.table('items').list(hid), synced.table('recipes').list(hid), synced.table('prices').list(hid), synced.table('rules').list(hid)])
    // session() started one pull; the four reads joined it (or found it finished) rather than starting their own.
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1)
    const seen: string[] = []
    synced.subscribe((e) => seen.push(`${e.origin}:${e.table}`))
    await synced.pull(hid)
    expect(seen.filter((x) => x.startsWith('remote:'))).toEqual([])
  })

  it('two phones that each eat one block offline both land: the remote shows two eaten', async () => {
    const s = await synced.session()
    const hid = s.activeHouseholdId!
    let onlineB = true
    const phoneB = new SyncedRepository(remote, { db: new QmDatabase(`mirror-b-${n}-${Date.now()}`), isOnline: () => onlineB, listen: false })
    await phoneB.session()
    const block = (await synced.table('freezer_blocks').list(hid)).find((b) => b.countRemaining >= 2)!
    await phoneB.table('freezer_blocks').list(hid)
    const start = block.countRemaining
    online = false
    onlineB = false
    const a = await synced.table('freezer_blocks').adjust!(block.id, 'countRemaining', -1)
    const b = await phoneB.table('freezer_blocks').adjust!(block.id, 'countRemaining', -1)
    // Each phone sees only its own change while offline.
    expect(a!.countRemaining).toBe(start - 1)
    expect(b!.countRemaining).toBe(start - 1)
    expect((await remote.table('freezer_blocks').get(block.id))!.countRemaining).toBe(start)
    const queued = await synced.db.outbox.toArray()
    expect(queued).toHaveLength(1)
    expect(queued[0]!.kind).toBe('delta')
    expect(queued[0]!.payload).toEqual({ field: 'countRemaining', delta: -1, base: start })
    online = true
    onlineB = true
    await synced.flush()
    await phoneB.flush()
    expect((await remote.table('freezer_blocks').get(block.id))!.countRemaining).toBe(start - 2)
    // A pull brings both mirrors to the converged count.
    await synced.pull(hid)
    await phoneB.pull(hid)
    expect((await synced.table('freezer_blocks').get(block.id))!.countRemaining).toBe(start - 2)
    expect((await phoneB.table('freezer_blocks').get(block.id))!.countRemaining).toBe(start - 2)
    phoneB.dispose()
  })

  it('eatFreezerBlock and adjustItemQty go through the delta op, and undo sends the opposite delta', async () => {
    const s = await synced.session()
    const hid = s.activeHouseholdId!
    const actor = { userId: s.userId }
    const block = (await synced.table('freezer_blocks').list(hid)).find((b) => b.countRemaining >= 1)!
    online = false
    const ate = await eatFreezerBlock(synced, block, actor)
    expect(ate.event.action).toBe('eat')
    expect((await synced.table('freezer_blocks').get(block.id))!.countRemaining).toBe(block.countRemaining - 1)
    await ate.undo()
    expect((await synced.table('freezer_blocks').get(block.id))!.countRemaining).toBe(block.countRemaining)
    const kinds = (await synced.db.outbox.toArray()).filter((o) => o.table === 'freezer_blocks').map((o) => o.kind)
    expect(kinds).toEqual(['delta', 'delta'])
    // An item in count mode: qty moves by the delta, status follows, and a clamped change undoes by what really applied.
    const item = (await synced.table('items').list(hid)).find((i) => i.trackMode === 'count' && (i.qty ?? 0) >= 1)!
    const used = await adjustItemQty(synced, item, -(item.qty! + 5), actor)
    const afterUse = (await synced.table('items').get(item.id))!
    expect(afterUse.qty).toBe(0)
    expect(afterUse.status).toBe('out')
    await used.undo()
    const restored = (await synced.table('items').get(item.id))!
    expect(restored.qty).toBe(item.qty)
    expect(restored.status).toBe(item.status)
    online = true
    await synced.flush()
    expect(synced.syncStatus().pending).toBe(0)
    expect(synced.syncStatus().lastError).toBeNull()
    expect((await remote.table('freezer_blocks').get(block.id))!.countRemaining).toBe(block.countRemaining)
    expect((await remote.table('items').get(item.id))!.qty).toBe(item.qty)
  })

  it('a remote with applyOps gets consecutive patch, delta and tombstone ops for one household as one call', async () => {
    const s = await synced.session()
    const hid = s.activeHouseholdId!
    const [a, b] = await synced.table('items').list(hid)
    const block = (await synced.table('freezer_blocks').list(hid)).find((x) => x.countRemaining >= 1)!
    const calls: ApplyOp[][] = []
    // A remote that batches: every op in the call goes to the LocalRepository one by one, so the data still lands.
    ;(remote as unknown as { applyOps: (ops: ApplyOp[]) => Promise<ApplyOpResult[]> }).applyOps = async (ops) => {
      calls.push(ops)
      const out: ApplyOpResult[] = []
      for (const op of ops) {
        const col = remote.table(op.table) as unknown as Collection<Record<string, unknown>>
        if (op.kind === 'patch') await col.patch(op.id, op.payload ?? {})
        else if (op.kind === 'softDelete') await col.softDelete(op.id)
        else await col.adjust!(op.id, String(op.payload?.field), Number(op.payload?.delta), { base: op.base })
        out.push({ ok: op.table !== 'rules', kind: op.kind, table: op.table, id: op.id, error: op.table === 'rules' ? 'nope' : undefined })
      }
      return out
    }
    online = false
    await synced.table('items').patch(a!.id, { notes: 'batched' })
    await synced.table('freezer_blocks').adjust!(block.id, 'countRemaining', -1)
    await synced.table('items').softDelete(b!.id)
    // A put breaks the run: it goes on its own, then the next run starts.
    const fresh = { ...a!, id: 'new-item-1', name: 'New thing', canonicalName: 'new thing', notes: null }
    await synced.table('items').put(fresh)
    await synced.table('items').patch(a!.id, { notes: 'batched twice' })
    online = true
    await synced.flush()
    expect(calls.map((c) => c.map((op) => op.kind))).toEqual([['patch', 'delta', 'softDelete'], ['patch']])
    expect(calls[0]![1]).toMatchObject({ table: 'freezer_blocks', id: block.id, kind: 'delta', payload: { field: 'countRemaining', delta: -1 }, base: block.countRemaining })
    expect(synced.syncStatus().pending).toBe(0)
    expect((await remote.table('items').get(a!.id))!.notes).toBe('batched twice')
    expect((await remote.table('items').get(b!.id))!.deletedAt).not.toBeNull()
    expect((await remote.table('items').get('new-item-1'))!.name).toBe('New thing')
    expect((await remote.table('freezer_blocks').get(block.id))!.countRemaining).toBe(block.countRemaining - 1)
    // A per-op rejection inside a batch drops that op and keeps the reason; the rest of the batch still counts.
    const rule = (await synced.table('rules').list(hid))[0]!
    await synced.table('rules').patch(rule.id, { active: false })
    await synced.flush()
    expect(synced.syncStatus().pending).toBe(0)
    expect(synced.syncStatus().lastError).toContain('rules: nope')
  })

  it('when applyOps itself fails for a reason that is not the network, the ops go one at a time instead', async () => {
    const s = await synced.session()
    const hid = s.activeHouseholdId!
    const item = (await synced.table('items').list(hid))[0]!
    ;(remote as unknown as { applyOps: () => Promise<never> }).applyOps = async () => {
      throw new Error('function public.apply_ops(jsonb) does not exist')
    }
    online = false
    await synced.table('items').patch(item.id, { notes: 'fallback' })
    online = true
    await synced.flush()
    expect(synced.syncStatus().pending).toBe(0)
    expect(synced.syncStatus().lastError).toBeNull()
    expect((await remote.table('items').get(item.id))!.notes).toBe('fallback')
  })
})
