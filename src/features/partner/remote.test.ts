import { describe, expect, it } from 'vitest'
import type { Item, Retailer } from '@/domain/types'
import { fromRemoteIntents } from './remote'

const now = '2026-10-07T12:00:00.000Z'
const tenant = { householdId: 'h1', createdAt: now, createdBy: null, updatedAt: now, updatedBy: null, deletedAt: null }
const eggs: Item = { ...tenant, id: 'eggs', name: 'Eggs', canonicalName: 'egg', category: 'dairy', locationId: null, trackMode: 'count', status: 'ok', qty: 12, unit: 'egg', par: 6, useBy: null, barcode: null, imagePath: null, alwaysHave: false, autoList: true, personId: null, defaultShelfLifeDays: null, notes: null, sortOrder: 0 }
const heb: Retailer = { ...tenant, id: 'heb', name: 'H-E-B', kind: 'heb', config: {}, isPrimaryGrocery: true, isPrimaryOther: false, sortOrder: 0 }
const ctx = { items: [eggs], aliases: [], alwaysHave: new Set<string>(), retailers: [heb], locations: [], today: '2026-10-07' }

describe('fromRemoteIntents', () => {
  it('turns write intents into confirm rows with the same matching and summaries as the local parser', () => {
    const r = fromRemoteIntents(
      [
        { kind: 'inventory.set_status', confidence: 0.9, items: [{ name: 'eggs', status: 'out' }, { name: 'dawn', status: 'low' }] },
        { kind: 'list.add', confidence: 0.8, items: [{ name: 'paper towels', qty: 2, unit: 'roll', retailer: 'H-E-B' }] },
      ],
      ctx,
    )
    expect(r.kind).toBe('changes')
    if (r.kind !== 'changes') return
    expect(r.result.changes.map((c) => [c.kind, c.itemId, c.confidence])).toEqual([
      ['set_status', 'eggs', 0.9],
      ['set_status', null, 0.3],
      ['list_add', null, 0.3],
    ])
    expect(r.result.changes[1]!.category).toBe('cleaning')
    expect(r.result.changes[2]!.retailerId).toBe('heb')
    expect(r.result.summary).toEqual(['Eggs: Out', 'Dawn: Low (new item)', 'Paper towels: to the list (2 rolls, H-E-B)'])
  })

  it('hands recipe.generate to the bank and falls back for anything the sheet answers locally', () => {
    expect(fromRemoteIntents([{ kind: 'recipe.generate', confidence: 0.9, brief: 'cheap crockpot dinner' }], ctx)).toMatchObject({ kind: 'generate', brief: 'cheap crockpot dinner' })
    expect(fromRemoteIntents([{ kind: 'inventory.query', confidence: 0.9, query: 'low' }], ctx)).toEqual({ kind: 'fallback' })
    expect(fromRemoteIntents([{ kind: 'plan.set', confidence: 0.9, date: '2026-10-08' }], ctx)).toEqual({ kind: 'fallback' })
    expect(fromRemoteIntents([], ctx)).toEqual({ kind: 'fallback' })
  })
})
