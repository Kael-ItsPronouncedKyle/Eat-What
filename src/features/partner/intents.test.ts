import { describe, expect, it } from 'vitest'
import type { Intent, Item, ItemAlias, ItemCategory, Location, Retailer, StockStatus, TenantRow, TrackMode } from '@/domain/types'
import { canonicalName } from '@/domain/names'
import { CONFIDENCE, changeDetail, describeChange, parseUtterance, resolveQuantity, speakLowOut, type ParseContext } from './intents'

const HH = 'hh-test'
const TODAY = '2026-10-07'

function base(id: string): TenantRow {
  return { id, householdId: HH, createdAt: '2026-10-01T00:00:00.000Z', createdBy: 'u1', updatedAt: '2026-10-01T00:00:00.000Z', updatedBy: 'u1', deletedAt: null }
}

function item(
  id: string,
  name: string,
  category: ItemCategory,
  locationId: string | null,
  opts: { mode?: TrackMode; status?: StockStatus; qty?: number; unit?: string; par?: number; useBy?: string; alwaysHave?: boolean } = {},
): Item {
  const mode = opts.mode ?? (opts.qty !== undefined ? 'count' : 'status')
  return {
    ...base(id),
    name,
    canonicalName: canonicalName(name),
    category,
    locationId,
    trackMode: mode,
    status: opts.status ?? 'ok',
    qty: mode === 'count' ? (opts.qty ?? 0) : null,
    unit: mode === 'count' ? (opts.unit ?? null) : null,
    par: mode === 'count' ? (opts.par ?? null) : null,
    useBy: opts.useBy ?? null,
    barcode: null,
    imagePath: null,
    alwaysHave: opts.alwaysHave ?? false,
    autoList: true,
    personId: null,
    defaultShelfLifeDays: null,
    notes: null,
    sortOrder: 0,
  }
}

const locations: Location[] = [
  { ...base('loc-pantry'), name: 'Pantry', kind: 'pantry', parentId: null, isFreezerShelf: false, sortOrder: 0 },
  { ...base('loc-fridge'), name: 'Fridge', kind: 'fridge', parentId: null, isFreezerShelf: false, sortOrder: 1 },
  { ...base('loc-freezer'), name: 'Freezer', kind: 'freezer', parentId: null, isFreezerShelf: false, sortOrder: 2 },
  { ...base('loc-cleaning'), name: 'Cleaning closet', kind: 'cleaning', parentId: null, isFreezerShelf: false, sortOrder: 3 },
]

const items: Item[] = [
  item('i-eggs', 'Eggs', 'dairy', 'loc-fridge', { qty: 8, unit: 'each', par: 6, useBy: '2026-10-20' }),
  item('i-butter', 'Butter', 'dairy', 'loc-fridge', { qty: 2, unit: 'stick', par: 2 }),
  item('i-milk', 'Milk', 'dairy', 'loc-fridge', { status: 'ok', useBy: '2026-10-08' }),
  item('i-half', 'Half and half', 'dairy', 'loc-fridge', { status: 'ok' }),
  item('i-beans', 'Black beans', 'pantry', 'loc-pantry', { qty: 4, unit: 'can', par: 2 }),
  item('i-crushed', 'Crushed tomatoes', 'pantry', 'loc-pantry', { qty: 2, unit: 'can', par: 2 }),
  item('i-diced', 'Diced tomatoes', 'pantry', 'loc-pantry', { qty: 3, unit: 'can', par: 2 }),
  item('i-rice', 'White rice', 'pantry', 'loc-pantry', { status: 'ok' }),
  item('i-towels', 'Paper towels', 'paper', 'loc-cleaning', { qty: 1, unit: 'roll', par: 4 }),
  item('i-dawn', 'Dawn dish soap', 'cleaning', 'loc-cleaning', { status: 'low' }),
  item('i-thighs', 'Boneless skinless chicken thighs', 'meat', 'loc-freezer', { qty: 1, unit: 'lb', par: 3 }),
  item('i-broth', 'Chicken broth', 'pantry', 'loc-pantry', { qty: 8, unit: 'cup', par: 8 }),
  item('i-salt', 'Salt', 'spice', 'loc-pantry', { status: 'ok', alwaysHave: true }),
]

const aliases: ItemAlias[] = [{ ...base('a-1'), itemId: 'i-dawn', alias: 'dish soap', source: 'voice', retailerId: null }]

const retailers: Retailer[] = [
  { ...base('r-heb'), name: 'H-E-B', kind: 'heb', config: {}, isPrimaryGrocery: true, isPrimaryOther: false, sortOrder: 0 },
  { ...base('r-walmart'), name: 'Walmart', kind: 'walmart', config: {}, isPrimaryGrocery: false, isPrimaryOther: true, sortOrder: 1 },
]

const ctx: ParseContext = { items, aliases, alwaysHave: new Set(['salt']), retailers, locations, today: TODAY }

const only = <K extends Intent['kind']>(intents: Intent[], kind: K): Extract<Intent, { kind: K }> => {
  expect(intents).toHaveLength(1)
  const i = intents[0]!
  expect(i.kind).toBe(kind)
  return i as Extract<Intent, { kind: K }>
}

describe('parseUtterance: inventory.add', () => {
  it('reads "add two cans of black beans and a bottle of Dawn" as one add with two items', () => {
    const r = parseUtterance('add two cans of black beans and a bottle of Dawn', ctx)
    const i = only(r.intents, 'inventory.add')
    expect(i.items).toEqual([
      { name: 'Black beans', qty: 2, unit: 'can', category: 'pantry' },
      { name: 'Dawn dish soap', qty: 1, unit: 'bottle', category: 'cleaning' },
    ])
    expect(r.changes.map((c) => [c.itemId, c.confidence])).toEqual([
      ['i-beans', CONFIDENCE.exact],
      ['i-dawn', CONFIDENCE.fuzzy],
    ])
    expect(i.confidence).toBe(CONFIDENCE.fuzzy)
    expect(r.summary).toEqual(['Black beans: 2 cans (Pantry)', 'Dawn dish soap: 1 bottle (Cleaning closet)'])
  })

  it('reads "we got 2 bags of rice"', () => {
    const r = parseUtterance('we got 2 bags of rice', ctx)
    const i = only(r.intents, 'inventory.add')
    expect(i.items).toEqual([{ name: 'White rice', qty: 2, unit: 'bag', category: 'pantry' }])
    expect(r.summary).toEqual(['White rice: 2 bags (Pantry)'])
    expect(r.changes[0]?.itemId).toBe('i-rice')
  })

  it('turns a 12-pack into the item\'s own unit and shows where it lives', () => {
    const r = parseUtterance('We got a 12-pack of paper towels.', ctx)
    only(r.intents, 'inventory.add')
    expect(r.summary).toEqual(['Paper towels: 12 rolls (Cleaning closet)'])
    expect(resolveQuantity(r.changes[0]!, items.find((i) => i.id === 'i-towels')!)).toEqual({ amount: 12, unit: 'roll' })
    expect(changeDetail(r.changes[0]!, ctx)).toBe('Now 1 roll. After: 13 rolls.')
  })

  it('adds something new with a spoken place and a guessed category', () => {
    const r = parseUtterance('add a box of trash bags to the garage', ctx)
    const i = only(r.intents, 'inventory.add')
    expect(i.items).toEqual([{ name: 'trash bags', qty: 1, unit: 'box', location: 'garage', category: 'household' }])
    expect(i.confidence).toBe(CONFIDENCE.unknown)
    expect(r.summary).toEqual(['Trash bags: 1 box (Garage, new item)'])
  })
})

describe('parseUtterance: inventory.set_status', () => {
  it('reads "we\'re out of eggs and low on butter" as two status rows', () => {
    const r = parseUtterance("we're out of eggs and low on butter", ctx)
    const i = only(r.intents, 'inventory.set_status')
    expect(i.items).toEqual([
      { name: 'Eggs', status: 'out' },
      { name: 'Butter', status: 'low' },
    ])
    expect(i.confidence).toBe(CONFIDENCE.exact)
    expect(r.summary).toEqual(['Eggs: Out', 'Butter: Low'])
  })

  it('reads a bare "out of paper towels"', () => {
    const r = parseUtterance('out of paper towels', ctx)
    const i = only(r.intents, 'inventory.set_status')
    expect(i.items).toEqual([{ name: 'Paper towels', status: 'out' }])
    expect(r.summary).toEqual(['Paper towels: Out'])
    expect(changeDetail(r.changes[0]!, ctx)).toBe('Sets the count to 0.')
  })

  it('carries the status across "and" and keeps "half and half" whole', () => {
    const r = parseUtterance("we're out of milk and half and half", ctx)
    const i = only(r.intents, 'inventory.set_status')
    expect(i.items).toEqual([
      { name: 'Milk', status: 'out' },
      { name: 'Half and half', status: 'out' },
    ])
  })

  it('flags something not in the pantry at low confidence and says so', () => {
    const r = parseUtterance("we're out of paper plates", ctx)
    const i = only(r.intents, 'inventory.set_status')
    expect(i.confidence).toBe(CONFIDENCE.unknown)
    expect(r.changes[0]?.itemId).toBeNull()
    expect(r.summary).toEqual(['Paper plates: Out (new item)'])
  })

  it('uses an alias: "dish soap is back" marks Dawn OK', () => {
    const r = parseUtterance('dish soap is back', ctx)
    const i = only(r.intents, 'inventory.set_status')
    expect(i.items).toEqual([{ name: 'Dawn dish soap', status: 'ok' }])
    expect(i.confidence).toBe(CONFIDENCE.exact)
  })
})

describe('parseUtterance: inventory.consume', () => {
  it('reads "used a can of tomatoes"', () => {
    const r = parseUtterance('used a can of tomatoes', ctx)
    const i = only(r.intents, 'inventory.consume')
    expect(i.items).toEqual([{ name: 'Crushed tomatoes', qty: 1, unit: 'can' }])
    expect(r.summary).toEqual(['Crushed tomatoes: used 1 can'])
    expect(changeDetail(r.changes[0]!, ctx)).toBe('Now 2 cans. After: 1 can.')
  })

  it('reads "used the last of the milk" as Out', () => {
    const r = parseUtterance('used the last of the milk', ctx)
    const i = only(r.intents, 'inventory.set_status')
    expect(i.items).toEqual([{ name: 'Milk', status: 'out' }])
    expect(r.summary).toEqual(['Milk: Out'])
  })
})

describe('parseUtterance: inventory.query', () => {
  it('answers "do we have any chicken left?" with every chicken item', () => {
    const r = parseUtterance('do we have any chicken left?', ctx)
    const i = only(r.intents, 'inventory.query')
    expect(i.itemNames).toEqual(['chicken'])
    expect(r.summary).toContain('Boneless skinless chicken thighs: 1 lb, Low (Freezer)')
    expect(r.summary).toContain('Chicken broth: 8 cups (Pantry)')
    expect(r.changes).toEqual([])
  })

  it('answers "what\'s expiring" from today', () => {
    const r = parseUtterance("what's expiring", ctx)
    const i = only(r.intents, 'inventory.query')
    expect(i.query).toBe('expiring')
    expect(r.summary).toEqual(['Milk: Use in the next 2 days'])
  })

  it('answers "what are we out of" with the Low and Out items', () => {
    const r = parseUtterance('what are we out of', ctx)
    const i = only(r.intents, 'inventory.query')
    expect(i.query).toBe('low')
    expect(r.summary).toEqual(['Boneless skinless chicken thighs: Low', 'Dawn dish soap: Low', 'Paper towels: Low'])
  })

  it('says when something is not in the pantry', () => {
    const r = parseUtterance('how much hummus do we have', ctx)
    const i = only(r.intents, 'inventory.query')
    expect(i.confidence).toBe(CONFIDENCE.unknown)
    expect(r.summary).toEqual(['Hummus: not in the pantry'])
  })
})

describe('parseUtterance: list.add', () => {
  it('reads "add Dawn to the list"', () => {
    const r = parseUtterance('add Dawn to the list', ctx)
    const i = only(r.intents, 'list.add')
    expect(i.items).toEqual([{ name: 'Dawn dish soap' }])
    expect(r.changes[0]).toMatchObject({ kind: 'list_add', itemId: 'i-dawn', retailerId: null })
    expect(r.summary).toEqual(['Dawn dish soap: to the list'])
  })

  it('reads "put thighs on the list" with a fuzzy match', () => {
    const r = parseUtterance('put thighs on the list', ctx)
    const i = only(r.intents, 'list.add')
    expect(i.items).toEqual([{ name: 'Boneless skinless chicken thighs' }])
    expect(i.confidence).toBe(CONFIDENCE.fuzzy)
  })

  it('reads "add Dawn, send it to Walmart" with the store', () => {
    const r = parseUtterance('add Dawn, send it to Walmart', ctx)
    const i = only(r.intents, 'list.add')
    expect(i.items).toEqual([{ name: 'Dawn dish soap', retailer: 'Walmart' }])
    expect(r.changes[0]).toMatchObject({ retailerId: 'r-walmart', retailerName: 'Walmart' })
    expect(r.summary).toEqual(['Dawn dish soap: to the list (Walmart)'])
  })

  it('reads "we need 2 lb of thighs from HEB"', () => {
    const r = parseUtterance('we need 2 lb of thighs from HEB', ctx)
    const i = only(r.intents, 'list.add')
    expect(i.items).toEqual([{ name: 'Boneless skinless chicken thighs', qty: 2, unit: 'lb', retailer: 'H-E-B' }])
    expect(r.summary).toEqual(['Boneless skinless chicken thighs: to the list (2 lb, H-E-B)'])
  })
})

describe('parseUtterance: recipe.suggest', () => {
  it('reads "what can I make tonight" as a dinner suggestion', () => {
    const r = parseUtterance('what can I make tonight', ctx)
    const i = only(r.intents, 'recipe.suggest')
    expect(i.filters).toEqual({ mealType: 'dinner' })
    expect(r.summary).toEqual(["Let's see what you can cook."])
  })

  it('reads "what\'s for dinner" and "something quick and seated"', () => {
    only(parseUtterance("what's for dinner", ctx).intents, 'recipe.suggest')
    const i = only(parseUtterance('what can we cook that is quick and seated?', ctx).intents, 'recipe.suggest')
    expect(i.filters).toEqual({ seatedFriendly: true, maxActiveMinutes: 20 })
  })
})

describe('parseUtterance: unknown', () => {
  it('asks one clarifying question for nonsense', () => {
    const r = parseUtterance('blorp the flibber', ctx)
    const i = only(r.intents, 'unknown')
    expect(i.confidence).toBe(CONFIDENCE.unknown)
    expect(i.clarify).toMatch(/out of eggs/)
    expect(r.summary).toEqual([i.clarify])
  })

  it('asks what a bare item name means instead of guessing', () => {
    const r = parseUtterance('eggs', ctx)
    const i = only(r.intents, 'unknown')
    expect(i.clarify).toBe('Did we get Eggs, run out of it, or should it go on the list?')
  })

  it('never returns two unknowns, and empty text is one unknown', () => {
    expect(parseUtterance('   ', ctx).intents.filter((i) => i.kind === 'unknown')).toHaveLength(1)
    expect(parseUtterance('hmm, uh, well', ctx).intents.filter((i) => i.kind === 'unknown')).toHaveLength(1)
  })
})

describe('mixed utterances and helpers', () => {
  it('keeps a restock and a status change in one breath as two intents', () => {
    const r = parseUtterance('we got eggs and we are out of milk', ctx)
    expect(r.intents.map((i) => i.kind)).toEqual(['inventory.add', 'inventory.set_status'])
    expect(r.summary).toEqual(['Eggs: 1 more each (Fridge)', 'Milk: Out'])
  })

  it('describes a fixed row with the item the person picked', () => {
    const r = parseUtterance('used a can of tomatoes', ctx)
    const fixed = { ...r.changes[0]!, itemId: 'i-diced' }
    expect(describeChange(fixed, ctx)).toBe('Diced tomatoes: used 1 can')
  })

  it('speaks the Low and Out items in plain words', () => {
    expect(speakLowOut(items)).toBe('Low: Boneless skinless chicken thighs, Dawn dish soap, Paper towels.')
    expect(speakLowOut([])).toBe('Nothing is low or out.')
  })
})
