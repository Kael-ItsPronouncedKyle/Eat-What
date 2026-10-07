import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LocalRepository } from '../local/LocalRepository'
import { QmDatabase } from '../local/db'
import { ensureDemoSeed } from '../seed/demo'
import { SyncedRepository } from './SyncedRepository'
import { logEvent } from '../mutations'

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
    const item = (await synced.table('items').list(hid))[0]!
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
})
