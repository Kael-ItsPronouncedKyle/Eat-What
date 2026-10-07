import { describe, it, expect } from 'vitest'
import { countItem, entry, item, line, price, recipeWith, retailer, routing, TODAY } from './fixtures.test-helpers'
import { estimateLineCents, groupByDestination, mergeIntoList, plainTextList, planNeeds, restockNeeds, routeLine, subtractStock } from './listing'

const thighs = countItem('Chicken thighs', 1, 'lb', 3, { canonicalName: 'chicken thigh', category: 'meat' })
const beans = countItem('Black beans', 4, 'can', 2, { canonicalName: 'black bean' })
const onion = countItem('Yellow onion', 0, null, 2, { canonicalName: 'yellow onion', category: 'produce', unit: 'each' })
const milk = item({ name: 'Milk', canonicalName: 'milk', status: 'low', category: 'dairy' })
const butter = item({ name: 'Butter', canonicalName: 'butter', status: 'ok', category: 'dairy' })
const towels = countItem('Paper towels', 1, 'roll', 4, { canonicalName: 'paper towel', category: 'paper' })
const dawn = item({ name: 'Dawn', canonicalName: 'dawn', status: 'low', category: 'cleaning' })
const items = [thighs, beans, onion, milk, butter, towels, dawn]
const ctx = { items, aliases: [], alwaysHave: new Set(['salt']) }

describe('planNeeds and subtractStock', () => {
  const chili = recipeWith({ title: 'Chili', baseYield: 4 }, [['chicken thighs', 2, 'lb', { canonicalName: 'chicken thigh' }], ['black beans', 2, 'can', { canonicalName: 'black bean' }], ['yellow onion', 1, null, { canonicalName: 'yellow onion' }], ['milk', 1, 'cup', { canonicalName: 'milk' }], ['butter', 2, 'tbsp', { canonicalName: 'butter' }], ['salt', 1, 'tsp', { canonicalName: 'salt' }], ['cilantro', 1, 'bunch', { canonicalName: 'cilantro', optional: true }]])
  const soup = recipeWith({ title: 'Soup', baseYield: 4 }, [['chicken thighs', 1.5, 'lb', { canonicalName: 'chicken thigh' }]])
  it('collects needs from plan entries in range, scaled by servings', () => {
    const needs = planNeeds([entry('2026-10-08', { recipeId: chili.id }), entry('2026-10-20', { recipeId: soup.id }), entry('2026-10-09', { recipeId: soup.id, servings: 8 })], [], [chili, soup], ctx, { from: '2026-10-06', to: '2026-10-12' })
    expect(needs.map((n) => `${n.name}:${n.qty ? n.qty.amount + (n.qty.unit ?? '') : '-'}`)).toEqual(['Chicken thighs:2lb', 'Black beans:2can', 'Yellow onion:1', 'Milk:1cup', 'Butter:2tbsp', 'Chicken thighs:3lb'])
  })
  it('subtracts stock line by line, combining same-item needs', () => {
    const needs = planNeeds([entry('2026-10-08', { recipeId: chili.id }), entry('2026-10-09', { recipeId: soup.id })], [], [chili, soup], ctx, { from: '2026-10-06', to: '2026-10-12' })
    const lines = subtractStock(needs, items)
    const by = (n: string) => lines.find((l) => l.need.name === n)!
    expect(by('Chicken thighs').buy).toEqual({ amount: 2.5, unit: 'lb' })
    expect(by('Chicken thighs').explanation).toBe('need 3 1/2 lb, have 1 lb, buy 2 1/2 lb')
    expect(by('Black beans').buy).toBeNull()
    expect(by('Yellow onion').buy).toEqual({ amount: 1, unit: null })
    expect(by('Milk').buy).toEqual({ amount: 1, unit: 'cup' })
    expect(by('Butter').buy).toBeNull()
    expect(lines.some((l) => l.need.name.toLowerCase().includes('salt'))).toBe(false)
  })
  it('restock needs: out buys par, low buys par minus qty', () => {
    const needs = restockNeeds(items)
    expect(needs.map((n) => `${n.name}:${n.reason.kind}:${n.qty ? n.qty.amount : '-'}`).sort()).toEqual(['Chicken thighs:low:2', 'Dawn:low:-', 'Milk:low:-', 'Paper towels:low:3', 'Yellow onion:out:2'])
    const off = { ...towels, autoList: false }
    expect(restockNeeds([off]).length).toBe(0)
  })
})

describe('mergeIntoList', () => {
  it('merges into one line per item with both reasons and the larger quantity', () => {
    const existing = [line('Chicken thighs', { itemId: thighs.id, qty: 2, unit: 'lb', reasons: [{ kind: 'low', ref: thighs.id }] })]
    const sub = subtractStock(planNeeds([entry('2026-10-08', { recipeId: recipeWith({ title: 'x' }, [['chicken thighs', 4, 'lb', { canonicalName: 'chicken thigh' }]]).id })], [], [recipeWith({ title: 'x' }, [['chicken thighs', 4, 'lb', { canonicalName: 'chicken thigh' }]])], ctx, { from: '2026-10-06', to: '2026-10-12' }), items)
    // That recipe id will not match because recipeWith creates a new id each call; build directly instead.
    const r = recipeWith({ title: 'y' }, [['chicken thighs', 4, 'lb', { canonicalName: 'chicken thigh' }]])
    const sub2 = subtractStock(planNeeds([entry('2026-10-08', { recipeId: r.id })], [], [r], ctx, { from: '2026-10-06', to: '2026-10-12' }), items)
    void sub
    let n = 0
    const m = mergeIntoList(existing, sub2, { householdId: 'h', now: '2026-10-07T00:00:00Z', newId: () => `new-${++n}` })
    expect(m.added).toEqual([])
    expect(m.updated.length).toBe(1)
    expect(m.updated[0]!.qty).toBe(3)
    expect(m.updated[0]!.reasons.map((x) => x.kind)).toEqual(['low', 'plan'])
  })
  it('adds new lines for unmatched needs and skips have-enough lines', () => {
    const r = recipeWith({ title: 'z' }, [['saffron', 1, 'tsp', { canonicalName: 'saffron' }], ['black beans', 1, 'can', { canonicalName: 'black bean' }]])
    const sub = subtractStock(planNeeds([entry('2026-10-08', { recipeId: r.id })], [], [r], ctx, { from: '2026-10-06', to: '2026-10-12' }), items)
    let n = 0
    const m = mergeIntoList([], sub, { householdId: 'h', now: '2026-10-07T00:00:00Z', newId: () => `new-${++n}` })
    expect(m.added.map((l) => l.name)).toEqual(['saffron'])
    expect(m.added[0]!.id).toBe('new-1')
  })
})

describe('routing, pricing, grouping', () => {
  const insta = retailer('Instacart', 'instacart', { isPrimaryGrocery: true, sortOrder: 0 })
  const amazon = retailer('Amazon', 'amazon', { isPrimaryOther: true, sortOrder: 1 })
  const walmart = retailer('Walmart', 'walmart', { sortOrder: 2, config: { aisleOrder: ['cleaning', 'paper'] } })
  const retailers = [insta, amazon, walmart]
  const rules = [routing('category', 'cleaning', walmart.id), routing('item', towels.id, walmart.id)]
  const rctx = { items, retailers, routingRules: rules, links: [] }
  it('routes item override, category rule, then primaries', () => {
    expect(routeLine({ itemId: towels.id, name: 'Paper towels' }, rctx)).toBe(walmart.id)
    expect(routeLine({ itemId: dawn.id, name: 'Dawn' }, rctx)).toBe(walmart.id)
    expect(routeLine({ itemId: thighs.id, name: 'Chicken thighs' }, rctx)).toBe(insta.id)
    expect(routeLine({ itemId: null, name: 'milk' }, rctx)).toBe(insta.id)
    expect(routeLine({ itemId: null, name: 'mystery gadget' }, rctx)).toBe(insta.id)
    const petFood = item({ name: 'Dog food', canonicalName: 'dog food', category: 'pet' })
    expect(routeLine({ itemId: petFood.id, name: 'Dog food' }, { ...rctx, items: [...items, petFood] })).toBe(amazon.id)
  })
  it('estimates lines only from known prices and groups by destination', () => {
    const prices = [price(thighs.id, 299, { unit: 'lb' }), price(towels.id, 1899, { unit: 'pack' })]
    const l1 = line('Chicken thighs', { itemId: thighs.id, qty: 2, unit: 'lb', retailerId: insta.id })
    const l2 = line('Paper towels', { itemId: towels.id, qty: 1, unit: 'pack', retailerId: walmart.id })
    const l3 = line('Mystery', { retailerId: insta.id })
    const l4 = line('Loose', {})
    expect(estimateLineCents(l1, { prices, items })).toBe(598)
    expect(estimateLineCents(l3, { prices, items })).toBeNull()
    const groups = groupByDestination([l1, l2, l3, l4], retailers, { prices, items })
    expect(groups.map((g) => `${g.retailer?.name ?? 'none'}:${g.lines.length}:${g.estimatedCents}:${g.unknownPrices}`)).toEqual(['Instacart:2:598:1', 'Walmart:1:1899:0', 'none:1:null:1'])
    const text = plainTextList(groups[1]!, items)
    expect(text).toContain('Walmart')
    expect(text).toContain('Paper goods')
    expect(text).toContain('- 1 pack Paper towels')
  })
})
