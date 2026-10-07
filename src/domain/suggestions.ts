import type { Energy, FreezerBlock, Item, ItemAlias, Person, Price, Recipe, RecipeWithIngredients, Rule, SuggestionFilters } from './types'
import type { IngredientAvailability, RecipeAvailability } from './matching'
import type { AllergyViolation, Substitution } from './rules'

export type SuggestionMode = 'make_now' | 'almost_there' | 'use_it_up' | 'freezer_first'

export interface SuggestionContext {
  recipes: RecipeWithIngredients[]
  items: Item[]
  aliases: ItemAlias[]
  alwaysHave: Set<string>
  freezerBlocks: FreezerBlock[]
  rules: Rule[]
  persons: Person[]
  prices: Price[]
  today: string
  energy?: Energy | null
  modes: Set<SuggestionMode>
  filters?: SuggestionFilters
  /** Person whose plate and allergies apply; null means the whole household. */
  personId?: string | null
}

/** One explainable term of the score ("why this"). */
export interface ScoreTerm {
  key: 'completeness' | 'rule_fit' | 'cuisine' | 'expiry' | 'freshness' | 'seated' | 'allergy'
  label: string
  value: number
  /** How the term enters the formula. */
  op: 'x' | '+'
}

export interface Suggestion {
  recipe: Recipe
  mode: SuggestionMode
  score: number
  terms: ScoreTerm[]
  availability: RecipeAvailability
  /** Required ingredients still needed (empty for make_now). */
  missing: IngredientAvailability[]
  expiringUsed: Item[]
  /** For freezer_first: the oldest block that fits. */
  freezerBlock: FreezerBlock | null
  substitutions: Substitution[]
  allergyBlocks: AllergyViolation[]
  costPerServingCents: number | null
  effortScore: number | null
}

/** Rank recipes for the modes that are on, after rules and filters. Sorted by score desc; each recipe appears once, under its best mode. */
export function suggest(_ctx: SuggestionContext): Suggestion[] {
  throw new Error('not implemented: suggest')
}

/** Score one recipe with explainable terms. Exported for tests and the "why this" sheet. */
export function scoreRecipe(_recipe: RecipeWithIngredients, _availability: RecipeAvailability, _ctx: SuggestionContext): { score: number; terms: ScoreTerm[] } {
  throw new Error('not implemented: scoreRecipe')
}

/** Apply the filter set (meal type, cuisine, minutes, seated, equipment, tags, nutrition ranges, missing count, search). */
export function passesFilters(_recipe: RecipeWithIngredients, _availability: RecipeAvailability, _filters: SuggestionFilters | undefined): boolean {
  throw new Error('not implemented: passesFilters')
}
