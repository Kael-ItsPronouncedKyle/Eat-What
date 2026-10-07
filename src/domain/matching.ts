import type { Item, ItemAlias, Recipe, RecipeIngredient, RecipeWithIngredients } from './types'
import type { Quantity } from './units'

export interface MatchContext {
  items: Item[]
  aliases: ItemAlias[]
  /** Canonical names of the household's "always have" pantry assumptions (salt, oil, water). */
  alwaysHave: Set<string>
}

export type MatchVia = 'resolved' | 'alias' | 'exact' | 'fuzzy' | 'always_have' | 'none'

export interface MatchResult {
  itemId: string | null
  confidence: number
  via: MatchVia
}

export type AvailabilityStatus =
  /** Enough in stock (or status OK/Low). */
  | 'have'
  /** Some in stock, but less than the recipe amount. */
  | 'short'
  /** Not in stock (status Out) or no matching item. */
  | 'missing'
  /** Optional ingredient that is missing; never blocks. */
  | 'optional_missing'
  /** On the always-have list, or units could not be compared but qty > 0. */
  | 'assumed'

export interface IngredientAvailability {
  ingredient: RecipeIngredient
  match: MatchResult
  item: Item | null
  status: AvailabilityStatus
  shortfall: Quantity | null
  /** True when the item is Low (status mode) or below par (count mode). */
  low: boolean
}

export interface RecipeAvailability {
  recipe: Recipe
  ingredients: IngredientAvailability[]
  /** 0..1: share of required ingredients that are have or assumed. */
  completeness: number
  /** Required ingredients that are missing or short. */
  missing: IngredientAvailability[]
  /** Items this recipe would use that expire within 7 days. */
  expiringItems: Item[]
}

/** Resolve one ingredient to an item: resolved item_id, then alias, then exact canonical name, then fuzzy >= 0.8, then always-have. */
export function matchIngredient(_ingredient: RecipeIngredient, _ctx: MatchContext): MatchResult {
  throw new Error('not implemented: matchIngredient')
}

/** Availability of one ingredient against stock, following the rules in CONTRACTS.md. */
export function ingredientAvailability(_ingredient: RecipeIngredient, _ctx: MatchContext, _today: string, _servingsMultiplier?: number): IngredientAvailability {
  throw new Error('not implemented: ingredientAvailability')
}

export function recipeAvailability(_recipe: RecipeWithIngredients, _ctx: MatchContext, _today: string, _servingsMultiplier?: number): RecipeAvailability {
  throw new Error('not implemented: recipeAvailability')
}

/** Find the item a free-text name refers to (voice, receipt, list add): alias, exact, then fuzzy. */
export function findItemByName(_name: string, _ctx: MatchContext): MatchResult {
  throw new Error('not implemented: findItemByName')
}
