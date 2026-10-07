import { describe, expect, it } from 'vitest'
import type { Item, ItemAlias } from './types'
import { lineUnitCents, matchReceiptLines, planReceiptSave, receiptSummary, sumLineTotals } from './receipts'

const now = '2026-10-07T12:00:00.000Z'
function item(partial: Partial<Item> & { id: string; name: string; canonicalName: string }): Item {
  return {
    householdId: 'h1', createdAt: now, createdBy: null, updatedAt: now, updatedBy: null, deletedAt: null,
    category: 'pantry', locationId: null, trackMode: 'status', status: 'ok', qty: null, unit: null, par: null, useBy: null,
    barcode: null, imagePath: null, alwaysHave: false, autoList: true, personId: null, defaultShelfLifeDays: null, notes: null, sortOrder: 0,
    ...partial,
  }
}
const eggs = item({ id: 'eggs', name: 'Eggs', canonicalName: 'egg', trackMode: 'count', qty: 2, unit: 'dozen', par: 2, status: 'low' })
const milk = item({ id: 'milk', name: 'Milk', canonicalName: 'milk', status: 'out' })
const towels = item({ id: 'towels', name: 'Paper towels', canonicalName: 'paper towel', trackMode: 'count', qty: 1, unit: 'roll', par: 4, status: 'low' })
const aliases: ItemAlias[] = [{ id: 'a1', householdId: 'h1', createdAt: now, createdBy: null, updatedAt: now, updatedBy: null, deletedAt: null, itemId: 'milk', alias: 'GV WHOLE MILK GAL', source: 'receipt', retailerId: null }]
const ctx = { items: [eggs, milk, towels], aliases, alwaysHave: new Set<string>() }
let n = 0
const newId = () => `id-${++n}`

describe('matchReceiptLines', () => {
  it('matches by alias, exact name and fuzzy name, and leaves the rest unmatched', () => {
    const rows = matchReceiptLines(
      [
        { name: 'GV WHOLE MILK GAL', qty: 1, unitPriceCents: 349, totalCents: 349 },
        { name: 'eggs', qty: 2, unitPriceCents: 299, totalCents: 598 },
        { name: 'Bounty paper towels', qty: 1, unitPriceCents: null, totalCents: 1299 },
        { name: 'Mystery gadget', qty: 1, unitPriceCents: 999, totalCents: 999 },
        { name: '  ', qty: null, unitPriceCents: null, totalCents: null },
      ],
      ctx,
    )
    expect(rows.map((r) => [r.itemId, r.via])).toEqual([
      ['milk', 'alias'],
      ['eggs', 'exact'],
      ['towels', 'fuzzy'],
      [null, 'none'],
      [null, 'none'],
    ])
    expect(rows[4]!.ignored).toBe(true)
    expect(rows.every((r) => r.auto)).toBe(true)
    expect(rows.map((r) => r.key)).toEqual(['line-0', 'line-1', 'line-2', 'line-3', 'line-4'])
  })
})

describe('lineUnitCents and sums', () => {
  it('prefers the printed unit price, then total over qty, and never guesses', () => {
    expect(lineUnitCents({ name: 'x', qty: 2, unitPriceCents: 199, totalCents: 398 })).toBe(199)
    expect(lineUnitCents({ name: 'x', qty: 3, unitPriceCents: null, totalCents: 600 })).toBe(200)
    expect(lineUnitCents({ name: 'x', qty: null, unitPriceCents: null, totalCents: 450 })).toBe(450)
    expect(lineUnitCents({ name: 'x', qty: 1, unitPriceCents: null, totalCents: null })).toBeNull()
    expect(sumLineTotals([{ name: 'a', qty: 2, unitPriceCents: 100, totalCents: null }, { name: 'b', qty: 1, unitPriceCents: null, totalCents: 50 }])).toBe(250)
  })
})

describe('planReceiptSave', () => {
  it('writes one receipt price per matched item, restocks count items, marks status items OK, and keeps ignored lines', () => {
    const rows = matchReceiptLines(
      [
        { name: 'GV WHOLE MILK GAL', qty: 1, unitPriceCents: 349, totalCents: 349 },
        { name: 'eggs', qty: 2, unitPriceCents: 299, totalCents: 598 },
        { name: 'eggs', qty: 1, unitPriceCents: 279, totalCents: 279 },
        { name: 'Mystery gadget', qty: 1, unitPriceCents: 999, totalCents: 999 },
        { name: 'Candy', qty: 1, unitPriceCents: 150, totalCents: 150 },
      ],
      ctx,
    )
    rows[4]!.ignored = true
    const plan = planReceiptSave({ householdId: 'h1', receiptId: 'r1', retailerId: 'heb', purchasedOn: '2026-10-05', totalCents: 2225, lines: rows, items: ctx.items, newId, now, userId: 'u1' })
    expect(plan.receiptLines.map((l) => l.status)).toEqual(['matched', 'matched', 'matched', 'unmatched', 'ignored'])
    expect(plan.receiptLines.every((l) => l.receiptId === 'r1' && l.householdId === 'h1')).toBe(true)
    expect(plan.prices).toHaveLength(2)
    const eggPrice = plan.prices.find((p) => p.itemId === 'eggs')!
    expect(eggPrice).toMatchObject({ priceCents: 299, source: 'receipt', retailerId: 'heb', observedOn: '2026-10-05', receiptId: 'r1', unit: 'dozen', unitQty: 1 })
    expect(plan.prices.find((p) => p.itemId === 'milk')!.note).toBe('Receipt line: GV WHOLE MILK GAL')
    expect(plan.restocks).toEqual([{ item: eggs, add: 3 }])
    expect(plan.markOk.map((i) => i.id)).toEqual(['milk'])
    expect(plan.spendCents).toBe(2225)
    expect(plan.matched).toBe(3)
    expect(plan.unmatched).toBe(1)
    expect(receiptSummary(plan, 'H-E-B')).toBe('Receipt from H-E-B: 2 prices, 2 restocked, 1 not matched')
  })

  it('writes no price for a line with no readable price and falls back to the line sum for spend', () => {
    const rows = matchReceiptLines([{ name: 'eggs', qty: 1, unitPriceCents: null, totalCents: null }, { name: 'milk', qty: 1, unitPriceCents: null, totalCents: 400 }], ctx)
    const plan = planReceiptSave({ householdId: 'h1', receiptId: 'r2', retailerId: null, purchasedOn: '2026-10-07', totalCents: null, lines: rows, items: ctx.items, newId, now, userId: null })
    expect(plan.prices.map((p) => p.itemId)).toEqual(['milk'])
    expect(plan.restocks).toEqual([{ item: eggs, add: 1 }])
    expect(plan.spendCents).toBe(400)
  })

  it('respects a hand fix that points a line at another item or clears it', () => {
    const rows = matchReceiptLines([{ name: 'Mystery gadget', qty: 2, unitPriceCents: 500, totalCents: 1000 }, { name: 'eggs', qty: 1, unitPriceCents: 299, totalCents: 299 }], ctx)
    rows[0]!.itemId = 'towels'
    rows[0]!.auto = false
    rows[1]!.itemId = null
    const plan = planReceiptSave({ householdId: 'h1', receiptId: 'r3', retailerId: null, purchasedOn: '2026-10-07', totalCents: null, lines: rows, items: ctx.items, newId, now, userId: null })
    expect(plan.prices.map((p) => [p.itemId, p.priceCents])).toEqual([['towels', 500]])
    expect(plan.restocks).toEqual([{ item: towels, add: 2 }])
    expect(plan.unmatched).toBe(1)
  })
})
