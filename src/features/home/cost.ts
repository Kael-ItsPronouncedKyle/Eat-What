import type { Price, RecipeWithIngredients } from '@/domain/types'
import { recipeAvailability, type IngredientAvailability, type MatchContext } from '@/domain/matching'
import { costPerServingCents, priceFor } from '@/domain/budget'
import type { Suggestion } from '@/domain/suggestions'

export interface CostQuote {
  /** Cents per serving from this household's own price book. */
  cents: number
  /** True when a starter estimate sits behind the number (spec: starter estimates get a badge). */
  starter: boolean
}

export interface CostContext extends MatchContext {
  prices: Price[]
  today: string
}

/** Whether any priced required ingredient relies on a starter estimate. */
export function starterBehind(ingredients: IngredientAvailability[], prices: Price[], today: string): boolean {
  for (const row of ingredients) {
    if (row.ingredient.optional || row.ingredient.deletedAt || !row.item) continue
    if (priceFor(row.item.id, null, prices, today)?.starter) return true
  }
  return false
}

/** Cost per serving for a recipe, or null when any required price is unknown. Never guessed. */
export function costQuote(recipe: RecipeWithIngredients, ctx: CostContext): CostQuote | null {
  try {
    const availability = recipeAvailability(recipe, ctx, ctx.today)
    const cents = recipe.costPerServingCents ?? costPerServingCents(availability.ingredients, recipe.baseYield, ctx.prices, ctx.today)
    if (cents === null) return null
    return { cents, starter: recipe.costPerServingCents === null && starterBehind(availability.ingredients, ctx.prices, ctx.today) }
  } catch {
    return null
  }
}

/** The suggestion engine already priced the recipe; only the starter flag is added here. */
export function quoteFromSuggestion(s: Suggestion, prices: Price[], today: string): CostQuote | null {
  if (s.costPerServingCents === null) return null
  try {
    return { cents: s.costPerServingCents, starter: s.recipe.costPerServingCents === null && starterBehind(s.availability.ingredients, prices, today) }
  } catch {
    return { cents: s.costPerServingCents, starter: false }
  }
}
