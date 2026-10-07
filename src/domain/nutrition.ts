import type { Nutrition, PlateProfile, RecipeIngredient } from './types'

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
  /** 'usda' when fdc_id resolved, 'builtin' from the fallback table, 'none' when unmapped. */
  source: 'usda' | 'builtin' | 'none'
}

/** Grams for an ingredient amount: from explicit grams, else unit conversion (mass), else density defaults for volume, else per-piece weights from the built-in table. */
export function ingredientGrams(_ingredient: RecipeIngredient): number | null {
  throw new Error('not implemented: ingredientGrams')
}

/** Look up per-100g nutrients from the USDA cache (by fdc_id) or the built-in staples table (by canonical name). */
export function nutrientsFor(_ingredient: RecipeIngredient, _usda: Map<number, NutrientsPer100g>): IngredientNutrition {
  throw new Error('not implemented: nutrientsFor')
}

/** Sum per-ingredient nutrition and divide by base yield. coverage = mapped grams / total grams. Null when nothing mapped. */
export function recipeNutrition(_ingredients: RecipeIngredient[], _baseYield: number, _usda: Map<number, NutrientsPer100g>): Nutrition | null {
  throw new Error('not implemented: recipeNutrition')
}

/** Scale a per-serving row by the plate's portion multiplier. */
export function plateNutrition(_nutrition: Nutrition, _plate: PlateProfile | null | undefined): Nutrition {
  throw new Error('not implemented: plateNutrition')
}

/** One compact line: "420 kcal · 28 g protein · 610 mg sodium" (fields chosen by the caller). */
export function nutritionLine(_n: Nutrition | null): string {
  throw new Error('not implemented: nutritionLine')
}
