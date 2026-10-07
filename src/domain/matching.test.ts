import { describe, it, expect } from 'vitest'
import { alias, countItem, item, recipeWith, TODAY } from './fixtures.test-helpers'
import { findItemByName, ingredientAvailability, matchIngredient, recipeAvailability } from './matching'

const thighs = countItem('Boneless skinless chicken thighs', 1, 'lb', 3, { canonicalName: 'boneless skinless chicken thigh', category: 'meat' })
const beans = countItem('Black beans', 2, 'can', 2, { canonicalName: 'black bean' })
const eggs = countItem('Eggs', 0, 'each', 6, { canonicalName: 'egg' })
const milk = item({ name: 'Milk', canonicalName: 'milk', status: 'low' })
const butter = item({ name: 'Butter', canonicalName: 'butter', status: 'out' })
const salt = item({ name: 'Salt', canonicalName: 'salt', alwaysHave: true })
const items = [thighs, beans, eggs, milk, butter, salt]
const ctx = { items, aliases: [alias(thighs.id, 'KRO CHKN THGH')], alwaysHave: new Set(['salt', 'water', 'oil']) }

describe('matchIngredient', () => {
  it('uses a resolved item id first', () => {
    const r = recipeWith({ title: 'x' }, [['anything', 1, null, { itemId: beans.id }]])
    expect(matchIngredient(r.ingredients[0]!, ctx)).toMatchObject({ itemId: beans.id, via: 'resolved' })
  })
  it('falls through when the resolved item is gone', () => {
    const r = recipeWith({ title: 'x' }, [['black beans', 1, 'can', { itemId: 'gone', canonicalName: 'black bean' }]])
    expect(matchIngredient(r.ingredients[0]!, ctx)).toMatchObject({ itemId: beans.id, via: 'exact' })
  })
  it('matches aliases case-insensitively', () => {
    expect(findItemByName('kro chkn thgh', ctx)).toMatchObject({ itemId: thighs.id, via: 'alias' })
  })
  it('matches fuzzily above 0.8 and not below', () => {
    expect(findItemByName('chicken thighs boneless skinless', ctx).itemId).toBe(thighs.id)
    expect(findItemByName('chicken broth', ctx).itemId).toBeNull()
  })
  it('treats always-have names as assumed', () => {
    expect(findItemByName('water', ctx)).toMatchObject({ itemId: null, via: 'always_have' })
  })
})

describe('ingredientAvailability', () => {
  const r = recipeWith({ title: 'Test', baseYield: 4 }, [
    ['chicken thighs', 2, 'lb', { canonicalName: 'chicken thigh' }],
    ['black beans', 1, 'can', { canonicalName: 'black bean' }],
    ['eggs', 2, null, { canonicalName: 'egg' }],
    ['milk', 1, 'cup', { canonicalName: 'milk' }],
    ['butter', 2, 'tbsp', { canonicalName: 'butter' }],
    ['salt', 1, 'tsp', { canonicalName: 'salt' }],
    ['cilantro', 1, 'bunch', { canonicalName: 'cilantro', optional: true }],
  ])
  const av = recipeAvailability(r, ctx, TODAY)
  const by = (n: string) => av.ingredients.find((a) => a.ingredient.ingredientName === n)!
  it('count item short of the recipe amount is short with the shortfall', () => {
    expect(by('chicken thighs').status).toBe('short')
    expect(by('chicken thighs').shortfall).toEqual({ amount: 1, unit: 'lb' })
    expect(by('chicken thighs').low).toBe(true)
  })
  it('count item at or above the amount is have', () => {
    expect(by('black beans').status).toBe('have')
  })
  it('count item at zero is missing', () => {
    expect(by('eggs').status).toBe('missing')
  })
  it('status Low counts as have but flags low; Out is missing', () => {
    expect(by('milk')).toMatchObject({ status: 'have', low: true })
    expect(by('butter').status).toBe('missing')
  })
  it('always-have item in stock is have; optional missing never blocks', () => {
    expect(by('salt').status).toBe('have')
    expect(by('cilantro').status).toBe('optional_missing')
  })
  it('computes completeness over required ingredients only', () => {
    // required: thighs(short) beans(have) eggs(missing) milk(have) butter(missing) salt(have) => 3/6
    expect(av.completeness).toBeCloseTo(0.5)
    expect(av.missing.map((m) => m.ingredient.ingredientName).sort()).toEqual(['butter', 'chicken thighs', 'eggs'])
  })
  it('scales by servings multiplier', () => {
    const one = ingredientAvailability(r.ingredients[1]!, ctx, TODAY, 2)
    expect(one.status).toBe('have')
    const three = ingredientAvailability(r.ingredients[1]!, ctx, TODAY, 3)
    expect(three.status).toBe('short')
  })
  it('incompatible units with stock on hand are assumed', () => {
    const r2 = recipeWith({ title: 'y' }, [['black beans', 15, 'oz', { canonicalName: 'black bean' }]])
    expect(ingredientAvailability(r2.ingredients[0]!, ctx, TODAY).status).toBe('assumed')
  })
  it('lists expiring items the recipe uses', () => {
    const soon = item({ name: 'Half and half', canonicalName: 'half and half', useBy: '2026-10-09' })
    const r3 = recipeWith({ title: 'z' }, [['half and half', 1, 'cup', { canonicalName: 'half and half' }]])
    const av3 = recipeAvailability(r3, { ...ctx, items: [...items, soon] }, TODAY)
    expect(av3.expiringItems.map((i) => i.name)).toEqual(['Half and half'])
  })
  it('a recipe with no required ingredients is complete', () => {
    expect(recipeAvailability(recipeWith({ title: 'w' }, []), ctx, TODAY).completeness).toBe(1)
  })
})
