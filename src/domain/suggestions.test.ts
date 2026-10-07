import { describe, it, expect } from 'vitest'
import { block, countItem, item, person, price, recipeWith, rule, TODAY } from './fixtures.test-helpers'
import { passesFilters, scoreRecipe, suggest, type SuggestionContext } from './suggestions'
import { recipeAvailability } from './matching'

const thighs = countItem('Chicken thighs', 3, 'lb', 3, { canonicalName: 'chicken thigh', category: 'meat' })
const beans = countItem('Black beans', 4, 'can', 2, { canonicalName: 'black bean' })
const onion = countItem('Yellow onion', 2, 'each', 2, { canonicalName: 'yellow onion', category: 'produce' })
const halfHalf = item({ name: 'Half and half', canonicalName: 'half and half', useBy: '2026-10-09', category: 'dairy' })
const broccoli = item({ name: 'Frozen broccoli', canonicalName: 'frozen broccoli', category: 'frozen' })
const coconutMilk = countItem('Coconut milk', 2, 'can', 1, { canonicalName: 'coconut milk' })
const items = [thighs, beans, onion, halfHalf, broccoli, coconutMilk]
const sarah = person('Sarah')

const chili = recipeWith({ title: 'Chili', cuisine: 'Mexican', effortScore: 2.5, tags: ['one_pot', 'seated_friendly'] }, [['chicken thighs', 2, 'lb', { canonicalName: 'chicken thigh' }], ['black beans', 2, 'can', { canonicalName: 'black bean' }], ['yellow onion', 1, 'each', { canonicalName: 'yellow onion' }]])
const soup = recipeWith({ title: 'Broccoli cheddar soup', cuisine: 'Midwestern comfort', effortScore: 2 }, [['frozen broccoli', 16, 'oz', { canonicalName: 'frozen broccoli' }], ['half and half', 2, 'cup', { canonicalName: 'half and half' }], ['cheddar', 8, 'oz', { canonicalName: 'cheddar' }]])
const curry = recipeWith({ title: 'Coconut curry', cuisine: 'Thai', effortScore: 2 }, [['coconut milk', 2, 'can', { canonicalName: 'coconut milk' }], ['chicken thighs', 1, 'lb', { canonicalName: 'chicken thigh' }]])
const stew = recipeWith({ title: 'Beef stew', cuisine: 'Midwestern comfort', effortScore: 4, lastCookedAt: '2026-10-03T00:00:00Z' }, [['beef chuck', 2, 'lb', { canonicalName: 'beef chuck' }], ['yellow onion', 1, 'each', { canonicalName: 'yellow onion' }], ['carrot', 4, 'each', { canonicalName: 'carrot' }], ['celery', 2, 'stalk', { canonicalName: 'celery' }]])
const draft = recipeWith({ title: 'Draft thing', status: 'draft' }, [])
const taco = recipeWith({ title: 'Taco meat', cuisine: 'Mexican', effortScore: 1.5 }, [['ground beef', 3, 'lb', { canonicalName: 'ground beef' }]])

const base = (): SuggestionContext => ({
  recipes: [chili, soup, curry, stew, draft, taco],
  items,
  aliases: [],
  alwaysHave: new Set(['salt']),
  freezerBlocks: [block('Taco meat', { recipeId: taco.id, cookedOn: '2026-09-01' }), block('Taco meat', { recipeId: taco.id, cookedOn: '2026-08-01', countRemaining: 0 })],
  rules: [rule('allergy', { ingredient: 'coconut', severity: 'avoid', substitute: 'lime juice' }, sarah.id), rule('cuisine', { cuisine: 'Mexican', weight: 'liked' }), rule('prep', { maxStandingMinutes: 20, seatedPreferred: true })],
  persons: [sarah],
  prices: [price(thighs.id, 299, { unit: 'lb' }), price(beans.id, 99, { unit: 'can' }), price(onion.id, 99, { unit: 'each' })],
  today: TODAY,
  modes: new Set(['make_now', 'almost_there', 'use_it_up', 'freezer_first']),
})

describe('suggest', () => {
  it('assigns modes and ranks with explainable terms', () => {
    const out = suggest(base())
    const byTitle = Object.fromEntries(out.map((s) => [s.recipe.title, s]))
    expect(byTitle['Chili']!.mode).toBe('make_now')
    expect(byTitle['Chili']!.availability.completeness).toBe(1)
    expect(byTitle['Chili']!.terms.find((t) => t.key === 'cuisine')!.value).toBe(1.2)
    expect(byTitle['Chili']!.terms.find((t) => t.key === 'seated')!.value).toBe(1.1)
    expect(byTitle['Chili']!.costPerServingCents).toBe(Math.round((598 + 198 + 99) / 4))
    expect(byTitle['Broccoli cheddar soup']!.mode).toBe('use_it_up')
    expect(byTitle['Broccoli cheddar soup']!.expiringUsed.map((i) => i.name)).toEqual(['Half and half'])
    expect(byTitle['Broccoli cheddar soup']!.missing.map((m) => m.ingredient.ingredientName)).toEqual(['cheddar'])
    expect(byTitle['Taco meat']!.mode).toBe('freezer_first')
    expect(byTitle['Taco meat']!.freezerBlock!.cookedOn).toBe('2026-09-01')
    expect(byTitle['Coconut curry']!.substitutions[0]).toMatchObject({ from: 'coconut milk', to: 'lime juice' })
    expect(byTitle['Draft thing']).toBeUndefined()
    expect(byTitle['Beef stew']).toBeUndefined()
    expect(out[0]!.recipe.title).toBe('Taco meat')
  })
  it('freshness penalty and expiry bonus show in the score', () => {
    const ctx = base()
    const recent = { ...chili, lastCookedAt: '2026-10-05T00:00:00Z' }
    const av = recipeAvailability(recent, { items, aliases: [], alwaysHave: ctx.alwaysHave }, TODAY)
    const s = scoreRecipe(recent, av, ctx)
    expect(s.terms.find((t) => t.key === 'freshness')!.value).toBe(-0.2)
    expect(s.score).toBeCloseTo(1 * 1.1 * 1.2 - 0.2, 3)
    const av2 = recipeAvailability(soup, { items, aliases: [], alwaysHave: ctx.alwaysHave }, TODAY)
    const s2 = scoreRecipe(soup, av2, ctx)
    expect(s2.terms.find((t) => t.key === 'expiry')!.value).toBeCloseTo(0.2, 3)
  })
  it('an unresolved allergy blocks the recipe', () => {
    const ctx = base()
    ctx.rules = [rule('allergy', { ingredient: 'coconut', severity: 'severe' }, null)]
    expect(suggest(ctx).some((s) => s.recipe.title === 'Coconut curry')).toBe(false)
  })
  it('energy and modes gate the output', () => {
    const ctx = base()
    ctx.energy = 'little'
    const titles = suggest(ctx).map((s) => s.recipe.title)
    expect(titles).not.toContain('Chili')
    expect(titles).toContain('Taco meat')
    ctx.energy = null
    ctx.modes = new Set(['make_now'])
    expect(suggest(ctx).map((s) => s.recipe.title)).toEqual(['Chili', 'Coconut curry'])
  })
  it('filters: search, maxMissing, cheapest, tags', () => {
    const ctx = base()
    ctx.filters = { search: 'broccoli' }
    expect(suggest(ctx).map((s) => s.recipe.title)).toEqual(['Broccoli cheddar soup'])
    ctx.filters = { maxMissing: 0 }
    expect(suggest(ctx).map((s) => s.recipe.title).sort()).toEqual(['Chili', 'Coconut curry'])
    ctx.filters = { cheapest: true }
    const cheap = suggest(ctx)
    expect(cheap[0]!.recipe.title).toBe('Chili')
    const av = recipeAvailability(chili, { items, aliases: [], alwaysHave: new Set() }, TODAY)
    expect(passesFilters(chili, av, { tags: ['one_pot'] })).toBe(true)
    expect(passesFilters(chili, av, { tags: ['sheet_pan'] })).toBe(false)
    expect(passesFilters(chili, av, { maxActiveMinutes: 10 })).toBe(false)
  })
  it('a variant replaces its parent only when it scores higher', () => {
    const ctx = base()
    const variant = { ...chili, id: 'variant-1', title: 'Chili (cheaper)', variantOfRecipeId: chili.id, cuisine: 'Thai' }
    ctx.recipes = [chili, variant]
    const out = suggest(ctx)
    expect(out.map((s) => s.recipe.title)).toEqual(['Chili'])
  })
})
