import { describe, it, expect } from 'vitest'
import { parseIngredientLine, parseNeelixExport, type NeelixImportContext } from './neelix'

let n = 0
const ctx: NeelixImportContext = { householdId: 'h', now: '2026-10-07T00:00:00Z', today: '2026-10-07', newId: () => `id-${++n}`, locationIds: { pantry: 'pantry', fridge: 'fridge', freezer: 'freezer', freezerShelf: 'shelf', cleaning: 'cleaning' }, instacartRetailerId: 'insta' }

const sample = {
  version: 'freezer-partner-state-v1',
  recipes: [
    { title: 'Brisket chili', servings: 8, ingredients: ['2 lb beef brisket, cubed', '1 onion, diced', '2 cans (15 oz) kidney beans, drained', 'salt and pepper to taste'], steps: ['Brown the beef.', 'Simmer 2 hours.'], freeze: 'Freeze in 2-cup cubes', twoPlate: { liam: 'Richer bowl', sarah: 'Lighter bowl' }, cuisine: 'Midwestern comfort' },
    { name: 'Gumbo', ingredients: [{ name: 'chicken thighs', amount: 1.5, unit: 'lbs' }, { text: '3 cloves garlic, minced' }], instructions: 'Make a roux.\nAdd everything.' },
    { nope: true },
  ],
  pantry: { eggs: { status: 'OK' }, milk: { status: 'Low' }, 'paper towels': { status: 'Out' } },
  freezer: [{ recipe: 'Brisket chili', size: '2-cup', count: 4, date: '2026-09-10', spot: 'Top drawer' }, { title: 'Broccoli soup', cups: 1, blocks: 3, for: 'Sarah' }],
  shoppingList: ['2 lb chicken thighs', { item: 'milk', done: false }, { item: 'bread', done: true }],
  priceBook: { milk: { price: 3.29, unit: 'gallon', date: '2026-09-30' }, 'chicken thighs': { cents: 299, unit: 'lb' } },
  quirks: [{ item: 'chicken thighs', searchAs: 'boneless skinless chicken thighs value pack' }, { item: 'unicorn', searchAs: 'x' }],
}

describe('parseIngredientLine', () => {
  it('parses amounts, units, names, preparation, and size notes', () => {
    expect(parseIngredientLine('2 cans (15 oz) black beans, drained and rinsed')).toMatchObject({ amount: 2, unit: 'can', name: 'black beans', preparation: '15 oz; drained and rinsed' })
    expect(parseIngredientLine('1 1/2 lb boneless skinless chicken thighs')).toMatchObject({ amount: 1.5, unit: 'lb', name: 'boneless skinless chicken thighs' })
    expect(parseIngredientLine('3 cloves garlic, minced')).toMatchObject({ amount: 3, unit: 'clove', name: 'garlic', preparation: 'minced' })
    const taste = parseIngredientLine('salt and pepper to taste')
    expect(taste.amount).toBeNull()
    expect(taste.confidence).toBeLessThan(0.6)
  })
})

describe('parseNeelixExport', () => {
  const plan = parseNeelixExport(sample, ctx)
  it('maps recipes with structured ingredients, steps, plate notes, and flags', () => {
    expect(plan.recipes.map((r) => r.title)).toEqual(['Brisket chili', 'Gumbo'])
    const chili = plan.recipes[0]!
    expect(chili.baseYield).toBe(8)
    expect(chili.ingredients.map((i) => `${i.amount ?? '-'} ${i.unit ?? '-'} ${i.ingredientName}`)).toEqual(['2 lb beef brisket', '1 - onion', '2 can kidney beans', '- - salt and pepper'])
    expect(chili.ingredients[3]!.optional).toBe(true)
    expect(chili.steps.length).toBe(2)
    expect(chili.plateNotes).toEqual({ liam: 'Richer bowl', sarah: 'Lighter bowl' })
    expect(chili.tags).toContain('freezer_safe')
    expect(plan.recipes[1]!.ingredients[0]).toMatchObject({ amount: 1.5, unit: 'lb' })
    expect(plan.recipes[1]!.ingredients[1]).toMatchObject({ amount: 3, unit: 'clove', ingredientName: 'garlic' })
    expect(plan.flagged.some((f) => f.line.includes('salt and pepper'))).toBe(true)
    expect(plan.unmapped.some((u) => u.path.includes('no title'))).toBe(true)
  })
  it('maps pantry, freezer, list, prices, and quirks', () => {
    expect(plan.items.map((i) => `${i.name}:${i.status}`)).toEqual(['eggs:ok', 'milk:low', 'paper towels:out', 'chicken thighs:ok'])
    expect(plan.items[2]!.category).toBe('paper')
    expect(plan.freezerBlocks[0]).toMatchObject({ title: 'Brisket chili', portionLabel: '2-cup', countRemaining: 4, cookedOn: '2026-09-10', freezerSpot: 'Top drawer', foodType: 'soup' })
    expect(plan.freezerBlocks[0]!.recipeId).toBe(plan.recipes[0]!.id)
    expect(plan.freezerBlocks[1]).toMatchObject({ portionLabel: '1-cup', countRemaining: 3, notes: 'Sarah' })
    expect(plan.listLines.map((l) => `${l.name}:${l.qty ?? '-'}`)).toEqual(['chicken thighs:2', 'milk:-'])
    expect(plan.listLines[1]!.itemId).toBe(plan.items[1]!.id)
    expect(plan.prices.map((p) => `${p.priceCents}:${p.observedOn}:${p.source}`)).toEqual(['329:2026-09-30:web', '299:2026-10-07:web'])
    expect(plan.aliases.length).toBe(1)
    expect(plan.aliases[0]!.source).toBe('instacart')
    expect(plan.flagged.some((f) => f.line.includes('unicorn'))).toBe(true)
    expect(plan.summary).toContain('2 recipes')
  })
  it('never throws on garbage', () => {
    expect(parseNeelixExport(null, ctx).summary).toContain('Nothing')
    expect(parseNeelixExport('not json', ctx).summary).toContain('not JSON')
    expect(parseNeelixExport({ foo: 1 }, ctx).summary).toContain('No recipes')
    expect(parseNeelixExport([{ title: 'Only' }], ctx).recipes.length).toBe(1)
  })
})
