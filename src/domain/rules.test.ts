import { describe, it, expect } from 'vitest'
import { person, recipe, recipeWith, rule } from './fixtures.test-helpers'
import { allergyViolations, applySubstitutions, cuisineWeight, describeRule, dietFlags, energyAllows, prepFit } from './rules'

const sarah = person('Sarah')
const liam = person('Liam')
const coconut = rule('allergy', { ingredient: 'coconut', severity: 'avoid', substitute: 'lime juice' }, sarah.id)
const cilantro = rule('allergy', { ingredient: 'cilantro', severity: 'dislike', substitute: 'scallion greens' }, sarah.id)
const shellfish = rule('allergy', { ingredient: 'shellfish', severity: 'severe' }, null)
const ctx = { rules: [coconut, cilantro, shellfish, rule('cuisine', { cuisine: 'Mexican', weight: 'liked' }), rule('cuisine', { cuisine: 'Mediterranean', weight: 'tolerated' }), rule('cuisine', { cuisine: 'Thai', weight: 'avoid' }), rule('prep', { maxStandingMinutes: 20, seatedPreferred: true, equipment: ['crockpot', 'oven', 'stovetop'] })], persons: [sarah, liam] }

describe('allergy rules', () => {
  const curry = recipeWith({ title: 'Curry' }, [['coconut milk', 2, 'can', { canonicalName: 'coconut milk' }], ['fresh cilantro', 1, 'bunch', { canonicalName: 'cilantro' }], ['rice', 2, 'cup', { canonicalName: 'rice' }]])
  it('finds violations by containment', () => {
    const v = allergyViolations(curry.ingredients, ctx)
    expect(v.map((x) => x.ingredientRule).sort()).toEqual(['cilantro', 'coconut'])
    expect(v[0]!.personName).toBe('Sarah')
  })
  it('scopes to a person: Liam alone has no coconut rule', () => {
    expect(allergyViolations(curry.ingredients, ctx, liam.id)).toEqual([])
    expect(allergyViolations(curry.ingredients, ctx, sarah.id).length).toBe(2)
  })
  it('applies substitutions and leaves unresolved ones', () => {
    const r = applySubstitutions(curry.ingredients, ctx)
    expect(r.substitutions.map((s) => `${s.from}->${s.to}`)).toEqual(['coconut milk->lime juice', 'fresh cilantro->scallion greens'])
    expect(r.ingredients[0]!.ingredientName).toBe('lime juice')
    expect(r.ingredients[0]!.amount).toBe(2)
    expect(r.unresolved).toEqual([])
    const shrimp = recipeWith({ title: 'Boil' }, [['shrimp, peeled', 1, 'lb', { canonicalName: 'shrimp' }], ['shellfish stock', 1, 'cup', { canonicalName: 'shellfish stock' }]])
    const r2 = applySubstitutions(shrimp.ingredients, ctx)
    // The shellfish family covers shrimp, so both lines are unresolved.
    expect(r2.unresolved.map((v) => v.ingredient.ingredientName)).toEqual(['shrimp, peeled', 'shellfish stock'])
    expect(r2.unresolved[0]!.severity).toBe('severe')
  })
  it('a family rule covers its members, by whole word only', () => {
    const nuts = rule('allergy', { ingredient: 'nuts', severity: 'severe' }, liam.id)
    const eggs = rule('allergy', { ingredient: 'eggs', severity: 'avoid', substitute: 'applesauce' }, null)
    const dairy = rule('allergy', { ingredient: 'dairy', severity: 'avoid', substitute: 'oat milk' }, null)
    const fam = { rules: [nuts, eggs, dairy], persons: [sarah, liam] }
    const cake = recipeWith({ title: 'Cake' }, [
      ['sliced almonds', 1, 'cup', { canonicalName: 'almond' }],
      ['coconut flakes', 1, 'cup', { canonicalName: 'coconut flake' }],
      ['2 eggs', 2, null, { canonicalName: 'egg' }],
      ['1 eggplant', 1, null, { canonicalName: 'eggplant' }],
      ['whole milk', 1, 'cup', { canonicalName: 'milk' }],
      ['coconut milk', 1, 'can', { canonicalName: 'coconut milk' }],
    ])
    const v = allergyViolations(cake.ingredients, fam)
    expect(v.map((x) => `${x.ingredient.ingredientName}:${x.ingredientRule}`)).toEqual(['sliced almonds:nuts', '2 eggs:eggs', 'whole milk:dairy'])
    expect(allergyViolations(cake.ingredients, fam, sarah.id).map((x) => x.ingredientRule)).toEqual(['eggs', 'dairy'])
    const r = applySubstitutions(cake.ingredients, fam)
    expect(r.substitutions.map((s) => `${s.from}->${s.to}`)).toEqual(['2 eggs->applesauce', 'whole milk->oat milk'])
    expect(r.unresolved.map((u) => u.ingredientRule)).toEqual(['nuts'])
    // A substitute that is itself in the family stays unresolved: almond milk for dairy is fine, cashew milk for nuts is not.
    const cashew = rule('allergy', { ingredient: 'tree nuts', severity: 'severe', substitute: 'cashew milk' }, null)
    const r3 = applySubstitutions([cake.ingredients[0]!], { rules: [cashew], persons: [] })
    expect(r3.substitutions).toEqual([])
    expect(r3.unresolved.length).toBe(1)
  })
  it('ignores inactive and deleted rules', () => {
    const off = { ...coconut, active: false }
    expect(allergyViolations(curry.ingredients, { ...ctx, rules: [off] })).toEqual([])
  })
})

describe('cuisine, prep, diet, energy', () => {
  it('weights cuisines', () => {
    expect(cuisineWeight('mexican', ctx)).toBe(1.2)
    expect(cuisineWeight('Mediterranean', ctx)).toBe(1)
    expect(cuisineWeight('Thai', ctx)).toBe(0.6)
    expect(cuisineWeight('Cajun', ctx)).toBe(1)
    expect(cuisineWeight(null, ctx)).toBe(1)
  })
  it('prep fit: seated bonus when standing fits', () => {
    expect(prepFit(recipe({ title: 'a', standingMinutes: 15 }), ctx)).toMatchObject({ factor: 1.1, standingOk: true })
    expect(prepFit(recipe({ title: 'b', standingMinutes: 45 }), ctx)).toMatchObject({ factor: 1, standingOk: false })
    expect(prepFit(recipe({ title: 'c', standingMinutes: 5, equipment: ['grill'] }), ctx).missingEquipment).toEqual(['grill'])
    expect(prepFit(recipe({ title: 'd', standingMinutes: 5, tags: ['seated_friendly'] }), { rules: [], persons: [] }).factor).toBe(1.1)
  })
  it('diet flags', () => {
    const diet = { rules: [rule('diet', { sodiumMaxMg: 700, proteinMinG: 25 })], persons: [] }
    const flags = dietFlags({ calories: 500, proteinG: 20, carbsG: 40, fiberG: 5, fatG: 20, sodiumMg: 900, addedSugarG: 2 }, diet)
    expect(flags.map((f) => f.kind).sort()).toEqual(['protein_under', 'sodium_over'])
    expect(dietFlags(null, diet)).toEqual([])
  })
  it('energy gate', () => {
    expect(energyAllows(2, 'little')).toBe(true)
    expect(energyAllows(2.5, 'little')).toBe(false)
    expect(energyAllows(3.5, 'some')).toBe(true)
    expect(energyAllows(5, 'some')).toBe(false)
    expect(energyAllows(5, 'plenty')).toBe(true)
    expect(energyAllows(null, 'little')).toBe(true)
  })
  it('describes rules plainly', () => {
    expect(describeRule(coconut, ctx)).toBe("Sarah can't have coconut. Swap in lime juice.")
    expect(describeRule(shellfish, ctx)).toBe('No shellfish for anyone.')
    expect(describeRule(ctx.rules[3]!, ctx)).toBe('Likes Mexican.')
    expect(describeRule(ctx.rules[6]!, ctx)).toContain('Seated prep, under 20 minutes standing')
  })
})
