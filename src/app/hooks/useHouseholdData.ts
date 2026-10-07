import { useMemo } from 'react'
import { useSession } from '@/app/session'
import { useCollections } from '@/data/provider'
import type { Recipe, RecipeIngredient, RecipeWithIngredients } from '@/domain/types'

/** Everything the suggestion engine, planner, and lists need, live. Loads once per household and refreshes on change. */
export function useHouseholdData() {
  const { household } = useSession()
  const hid = household?.id ?? null
  const data = useCollections(
    ['items', 'item_aliases', 'recipes', 'recipe_ingredients', 'rules', 'persons', 'freezer_blocks', 'prices', 'containers', 'locations', 'retailers', 'routing_rules', 'item_retailer_links', 'plan_entries', 'batches', 'list_lines', 'list_sends', 'spend', 'cook_weeks'] as const,
    hid,
  )
  const recipesWithIngredients = useMemo<RecipeWithIngredients[]>(() => joinRecipes(data.recipes, data.recipe_ingredients), [data.recipes, data.recipe_ingredients])
  const alwaysHave = useMemo(() => new Set(data.items.filter((i) => i.alwaysHave).map((i) => i.canonicalName)), [data.items])
  return { householdId: hid, ...data, recipesWithIngredients, alwaysHave }
}

export function joinRecipes(recipes: Recipe[], ingredients: RecipeIngredient[]): RecipeWithIngredients[] {
  const byRecipe = new Map<string, RecipeIngredient[]>()
  for (const ing of ingredients) {
    const list = byRecipe.get(ing.recipeId) ?? []
    list.push(ing)
    byRecipe.set(ing.recipeId, list)
  }
  return recipes.map((r) => ({ ...r, ingredients: (byRecipe.get(r.id) ?? []).slice().sort((a, b) => a.position - b.position) }))
}

export type HouseholdData = ReturnType<typeof useHouseholdData>
