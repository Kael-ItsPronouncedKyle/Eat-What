import type { Nutrition, PlateProfile, RecipeIngredient } from './types'
import { canonicalName, nameTokens } from './names'
import { convert, normalizeUnit, unitDimension } from './units'
import { BUILTIN_NUTRIENTS, CONTAINER_GRAMS, DENSITY, PIECE_GRAMS } from './nutrition-data'

export interface NutrientsPer100g {
  calories: number
  proteinG: number
  carbsG: number
  fiberG: number
  fatG: number
  sodiumMg: number
  addedSugarG: number
}

export interface IngredientNutrition {
  ingredient: RecipeIngredient
  grams: number | null
  per100g: NutrientsPer100g | null
  source: 'usda' | 'builtin' | 'none'
}

function lookup<T>(table: Record<string, T>, name: string): T | null {
  const canon = canonicalName(name)
  if (table[canon] !== undefined) return table[canon]!
  // Progressively drop leading words ("boneless skinless chicken thigh" -> "chicken thigh" -> "thigh").
  const tokens = nameTokens(canon)
  for (let i = 1; i < tokens.length; i++) {
    const key = tokens.slice(i).join(' ')
    if (table[key] !== undefined) return table[key]!
  }
  // Then trailing words ("chicken thigh value pack" -> "chicken thigh").
  for (let i = tokens.length - 1; i > 0; i--) {
    const key = tokens.slice(0, i).join(' ')
    if (table[key] !== undefined) return table[key]!
  }
  return null
}

/** Grams for an ingredient amount: explicit grams, mass conversion, volume x density, or per-piece / per-container weights. */
export function ingredientGrams(ingredient: RecipeIngredient): number | null {
  if (ingredient.grams !== null && ingredient.grams !== undefined && ingredient.grams > 0) return ingredient.grams
  if (ingredient.amount === null || ingredient.amount === undefined || !(ingredient.amount > 0)) return null
  const unit = normalizeUnit(ingredient.unit)
  const name = ingredient.canonicalName || ingredient.ingredientName
  if (unit === null) {
    const piece = lookup(PIECE_GRAMS, name)
    return piece ? ingredient.amount * piece : null
  }
  const dim = unitDimension(unit)
  if (dim === 'mass') {
    const g = convert({ amount: ingredient.amount, unit }, 'g')
    return g ? g.amount : null
  }
  if (dim === 'volume') {
    const ml = convert({ amount: ingredient.amount, unit }, 'ml')
    if (!ml) return null
    const density = lookup(DENSITY, name) ?? 1
    return ml.amount * density
  }
  // Count units: can, clove, slice, stick ...
  if (unit === 'clove') return ingredient.amount * 3
  const piece = lookup(PIECE_GRAMS, name)
  if (piece && (unit === 'each' || unit === 'piece' || unit === 'can' || unit === 'head' || unit === 'slice')) return ingredient.amount * piece
  const container = CONTAINER_GRAMS[unit]
  if (container) return ingredient.amount * container
  return piece ? ingredient.amount * piece : null
}

/** Per-100g nutrients from the USDA cache (by fdc_id) or the built-in staples table (by canonical name). */
export function nutrientsFor(ingredient: RecipeIngredient, usda: Map<number, NutrientsPer100g>): IngredientNutrition {
  const grams = ingredientGrams(ingredient)
  if (ingredient.fdcId !== null && ingredient.fdcId !== undefined) {
    const hit = usda.get(ingredient.fdcId)
    if (hit) return { ingredient, grams, per100g: hit, source: 'usda' }
  }
  const builtin = lookup(BUILTIN_NUTRIENTS, ingredient.canonicalName || ingredient.ingredientName)
  if (builtin) return { ingredient, grams, per100g: builtin, source: 'builtin' }
  return { ingredient, grams, per100g: null, source: 'none' }
}

/** Sum per-ingredient nutrition and divide by base yield. coverage = mapped grams / total grams. Null when nothing mapped. */
export function recipeNutrition(ingredients: RecipeIngredient[], baseYield: number, usda: Map<number, NutrientsPer100g>): Nutrition | null {
  if (!(baseYield > 0)) return null
  const totals = { calories: 0, proteinG: 0, carbsG: 0, fiberG: 0, fatG: 0, sodiumMg: 0, addedSugarG: 0 }
  let mappedGrams = 0
  let totalGrams = 0
  for (const ing of ingredients) {
    if (ing.deletedAt) continue
    const row = nutrientsFor(ing, usda)
    if (row.grams === null) continue
    totalGrams += row.grams
    if (!row.per100g) continue
    mappedGrams += row.grams
    const f = row.grams / 100
    totals.calories += row.per100g.calories * f
    totals.proteinG += row.per100g.proteinG * f
    totals.carbsG += row.per100g.carbsG * f
    totals.fiberG += row.per100g.fiberG * f
    totals.fatG += row.per100g.fatG * f
    totals.sodiumMg += row.per100g.sodiumMg * f
    totals.addedSugarG += row.per100g.addedSugarG * f
  }
  if (mappedGrams === 0) return null
  const r = (x: number) => Math.round((x / baseYield) * 10) / 10
  return {
    calories: Math.round(totals.calories / baseYield),
    proteinG: r(totals.proteinG),
    carbsG: r(totals.carbsG),
    fiberG: r(totals.fiberG),
    fatG: r(totals.fatG),
    sodiumMg: Math.round(totals.sodiumMg / baseYield),
    addedSugarG: r(totals.addedSugarG),
    coverage: totalGrams > 0 ? Math.round((mappedGrams / totalGrams) * 100) / 100 : 0,
  }
}

/** Scale a per-serving row by the plate's portion multiplier. */
export function plateNutrition(nutrition: Nutrition, plate: PlateProfile | null | undefined): Nutrition {
  const m = plate?.portionMultiplier && plate.portionMultiplier > 0 ? plate.portionMultiplier : 1
  if (m === 1) return nutrition
  const r = (x: number) => Math.round(x * m * 10) / 10
  return { ...nutrition, calories: Math.round(nutrition.calories * m), proteinG: r(nutrition.proteinG), carbsG: r(nutrition.carbsG), fiberG: r(nutrition.fiberG), fatG: r(nutrition.fatG), sodiumMg: Math.round(nutrition.sodiumMg * m), addedSugarG: r(nutrition.addedSugarG) }
}

/** One compact line: "420 kcal · 28 g protein · 610 mg sodium". */
export function nutritionLine(n: Nutrition | null): string {
  if (!n) return ''
  return `${n.calories} kcal · ${Math.round(n.proteinG)} g protein · ${Math.round(n.carbsG)} g carbs · ${Math.round(n.fatG)} g fat · ${n.sodiumMg} mg sodium`
}
