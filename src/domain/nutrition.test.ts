import { describe, it, expect } from 'vitest'
import { ingredient, recipeWith } from './fixtures.test-helpers'
import { ingredientGrams, nutrientsFor, nutritionLine, plateNutrition, recipeNutrition } from './nutrition'

describe('nutrition', () => {
  it('turns amounts into grams by mass, volume with density, pieces, and cans', () => {
    expect(ingredientGrams(ingredient('r', 'chicken thighs', 2, 'lb', { canonicalName: 'chicken thigh' }))).toBeCloseTo(907, 0)
    expect(ingredientGrams(ingredient('r', 'flour', 1, 'cup', { canonicalName: 'all-purpose flour' }))!).toBeGreaterThan(120)
    expect(ingredientGrams(ingredient('r', 'flour', 1, 'cup', { canonicalName: 'all-purpose flour' }))!).toBeLessThan(130)
    expect(ingredientGrams(ingredient('r', 'milk', 1, 'cup', { canonicalName: 'milk' }))!).toBeCloseTo(237, -1)
    expect(ingredientGrams(ingredient('r', 'eggs', 2, null, { canonicalName: 'egg' }))).toBe(100)
    expect(ingredientGrams(ingredient('r', 'garlic', 3, 'clove', { canonicalName: 'garlic' }))).toBe(9)
    expect(ingredientGrams(ingredient('r', 'black beans', 2, 'can', { canonicalName: 'black bean' }))).toBe(510)
    expect(ingredientGrams(ingredient('r', 'saffron', null, null, { canonicalName: 'saffron' }))).toBeNull()
    expect(ingredientGrams(ingredient('r', 'x', 1, 'g', { grams: 42 }))).toBe(42)
  })
  it('looks up builtin nutrients with partial names and usda ids first', () => {
    const usda = new Map([[1001, { calories: 1, proteinG: 1, carbsG: 1, fiberG: 1, fatG: 1, sodiumMg: 1, addedSugarG: 0 }]])
    expect(nutrientsFor(ingredient('r', 'boneless skinless chicken thighs', 1, 'lb', { canonicalName: 'boneless skinless chicken thigh' }), usda).source).toBe('builtin')
    expect(nutrientsFor(ingredient('r', 'x', 1, 'lb', { canonicalName: 'x', fdcId: 1001 }), usda).source).toBe('usda')
    expect(nutrientsFor(ingredient('r', 'unicorn', 1, 'lb', { canonicalName: 'unicorn' }), usda).source).toBe('none')
  })
  it('sums a recipe per serving with coverage, null when nothing maps', () => {
    const r = recipeWith({ title: 'Eggs', baseYield: 2 }, [['eggs', 4, null, { canonicalName: 'egg' }], ['butter', 1, 'tbsp', { canonicalName: 'butter' }], ['unicorn dust', 10, 'g', { canonicalName: 'unicorn dust' }]])
    const n = recipeNutrition(r.ingredients, 2, new Map())!
    // eggs 200 g at 143 kcal/100 g = 286; butter 14.8 ml * 0.95 = 14 g at 717 = 101; total 387 / 2 = 193
    expect(n.calories).toBe(193)
    expect(n.proteinG).toBeCloseTo(13.1, 0)
    expect(n.coverage).toBeCloseTo(214 / 224, 2)
    expect(recipeNutrition([ingredient('r', 'unicorn', 1, 'lb', { canonicalName: 'unicorn' })], 2, new Map())).toBeNull()
    expect(plateNutrition(n, { portionMultiplier: 0.5 }).calories).toBe(97)
    expect(nutritionLine(n)).toContain('193 kcal')
    expect(nutritionLine(null)).toBe('')
  })
})
