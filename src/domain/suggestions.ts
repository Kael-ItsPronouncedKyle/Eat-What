import type { Energy, FreezerBlock, Item, ItemAlias, Person, Price, Recipe, RecipeWithIngredients, Rule, SuggestionFilters } from './types'
import { recipeAvailability, type IngredientAvailability, type RecipeAvailability } from './matching'
import { allergyViolations, applySubstitutions, cuisineWeight, energyAllows, prepFit, type AllergyViolation, type Substitution } from './rules'
import { effortScore as computeEffort } from './effort'
import { costPerServingCents } from './budget'
import { expiryHorizon } from './status'
import { daysBetween, formatDate } from './dates'

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
  personId?: string | null
}

export interface ScoreTerm {
  key: 'completeness' | 'rule_fit' | 'cuisine' | 'expiry' | 'freshness' | 'seated' | 'allergy'
  label: string
  value: number
  op: 'x' | '+'
}

export interface Suggestion {
  recipe: Recipe
  mode: SuggestionMode
  score: number
  terms: ScoreTerm[]
  availability: RecipeAvailability
  missing: IngredientAvailability[]
  expiringUsed: Item[]
  freezerBlock: FreezerBlock | null
  substitutions: Substitution[]
  allergyBlocks: AllergyViolation[]
  costPerServingCents: number | null
  effortScore: number | null
}

export const FRESHNESS_DAYS = 10
export const FRESHNESS_PENALTY = -0.2
export const EXPIRY_MAX_BONUS = 0.3
/** A block already in the freezer is zero prep, so it outranks anything that needs cooking. */
export const FREEZER_FIRST_SCORE = 1.5

const MODE_ORDER: SuggestionMode[] = ['freezer_first', 'make_now', 'use_it_up', 'almost_there']

function recipeEffort(recipe: Recipe): number | null {
  if (recipe.effortScore !== null && recipe.effortScore !== undefined) return recipe.effortScore
  try {
    return computeEffort(recipe)
  } catch {
    return null
  }
}

function oldestBlock(recipeId: string, ctx: SuggestionContext): FreezerBlock | null {
  const blocks = ctx.freezerBlocks.filter((b) => !b.deletedAt && b.recipeId === recipeId && b.countRemaining > 0 && b.foodType !== 'raw_marinated' && (!ctx.personId || !b.personId || b.personId === ctx.personId))
  blocks.sort((a, b) => (a.cookedOn ?? '').localeCompare(b.cookedOn ?? '') || (a.qualityUntil ?? '').localeCompare(b.qualityUntil ?? ''))
  return blocks[0] ?? null
}

/** Score one recipe with explainable terms. */
export function scoreRecipe(recipe: RecipeWithIngredients, availability: RecipeAvailability, ctx: SuggestionContext): { score: number; terms: ScoreTerm[] } {
  const ruleCtx = { rules: ctx.rules, persons: ctx.persons }
  const terms: ScoreTerm[] = []
  const required = availability.ingredients.filter((a) => !a.ingredient.optional)
  const good = required.filter((a) => a.status === 'have' || a.status === 'assumed').length
  terms.push({ key: 'completeness', label: required.length ? `Have ${good} of ${required.length} ingredients` : 'No ingredients listed', value: round(availability.completeness), op: 'x' })

  const subs = applySubstitutions(recipe.ingredients, ruleCtx, ctx.personId ?? null)
  const allergyPass = subs.unresolved.length === 0
  if (!allergyPass) {
    const v = subs.unresolved[0]!
    terms.push({ key: 'allergy', label: `${v.personName ? `${v.personName}'s` : 'House'} rule: ${v.ingredientRule} with no swap`, value: 0, op: 'x' })
  } else if (subs.substitutions.length) {
    const s = subs.substitutions[0]!
    terms.push({ key: 'allergy', label: `${s.personName ? `${s.personName}'s` : 'House'} rule: swapped ${s.to} for ${s.from}`, value: 1, op: 'x' })
  }
  const prep = prepFit(recipe, ruleCtx)
  terms.push({ key: 'seated', label: prep.factor > 1 ? 'Seated-friendly prep' : prep.standingOk ? 'Prep fits the house' : 'More standing than the house rule', value: prep.factor, op: 'x' })
  const ruleFit = (allergyPass ? 1 : 0) * prep.factor
  terms.push({ key: 'rule_fit', label: 'Rule fit', value: round(ruleFit), op: 'x' })

  const cw = cuisineWeight(recipe.cuisine, ruleCtx)
  terms.push({ key: 'cuisine', label: cw > 1 ? `${recipe.cuisine} is a favorite` : cw < 1 ? `${recipe.cuisine} is on the avoid list` : recipe.cuisine ? `${recipe.cuisine}` : 'No cuisine set', value: cw, op: 'x' })

  let expiryPoints = 0
  for (const it of availability.expiringItems) {
    const h = expiryHorizon(it, ctx.today)
    expiryPoints += h === 'two_days' || h === 'expired' ? 2 : 1
  }
  const expiry = EXPIRY_MAX_BONUS * Math.min(1, expiryPoints / 3)
  if (availability.expiringItems.length) {
    const first = availability.expiringItems[0]!
    terms.push({ key: 'expiry', label: `Uses the ${first.name.toLowerCase()} that expires ${first.useBy ? formatDate(first.useBy, 'weekday') : 'soon'}`, value: round(expiry), op: '+' })
  }
  let freshness = 0
  if (recipe.lastCookedAt) {
    const days = daysBetween(recipe.lastCookedAt.slice(0, 10), ctx.today)
    if (days >= 0 && days <= FRESHNESS_DAYS) {
      freshness = FRESHNESS_PENALTY
      terms.push({ key: 'freshness', label: `Cooked ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}`, value: freshness, op: '+' })
    }
  }
  const score = availability.completeness * ruleFit * cw + expiry + freshness
  return { score: round(score), terms }
}

/** Apply the filter set. */
export function passesFilters(recipe: RecipeWithIngredients, availability: RecipeAvailability, filters: SuggestionFilters | undefined): boolean {
  if (!filters) return true
  if (filters.mealType && recipe.mealType !== filters.mealType) return false
  if (filters.cuisine && (recipe.cuisine ?? '').toLowerCase() !== filters.cuisine.toLowerCase()) return false
  if (filters.maxActiveMinutes !== undefined && (recipe.activeMinutes ?? 0) > filters.maxActiveMinutes) return false
  if (filters.seatedFriendly && !recipe.tags.includes('seated_friendly')) return false
  if (filters.equipment && filters.equipment.length && !filters.equipment.some((e) => recipe.equipment.includes(e))) return false
  if (filters.tags && filters.tags.length && !filters.tags.every((t) => recipe.tags.includes(t))) return false
  if (filters.freezerSafe && !recipe.tags.includes('freezer_safe')) return false
  if (filters.maxMissing !== undefined && availability.missing.length > filters.maxMissing) return false
  if (filters.maxCalories !== undefined && recipe.nutrition && recipe.nutrition.calories > filters.maxCalories) return false
  if (filters.minProteinG !== undefined && recipe.nutrition && recipe.nutrition.proteinG < filters.minProteinG) return false
  if (filters.maxSodiumMg !== undefined && recipe.nutrition && recipe.nutrition.sodiumMg > filters.maxSodiumMg) return false
  if (filters.search) {
    const q = filters.search.trim().toLowerCase()
    if (q) {
      const hay = `${recipe.title} ${recipe.cuisine ?? ''} ${recipe.description ?? ''} ${recipe.ingredients.map((i) => i.ingredientName).join(' ')}`.toLowerCase()
      if (!q.split(/\s+/).every((tok) => hay.includes(tok))) return false
    }
  }
  return true
}

/** Rank recipes for the modes that are on, after rules and filters. Each recipe appears once, under its best mode. */
export function suggest(ctx: SuggestionContext): Suggestion[] {
  const matchCtx = { items: ctx.items, aliases: ctx.aliases, alwaysHave: ctx.alwaysHave }
  const ruleCtx = { rules: ctx.rules, persons: ctx.persons }
  const energy = ctx.filters?.energy ?? ctx.energy ?? null
  const byId = new Map(ctx.recipes.map((r) => [r.id, r] as const))
  const out: Suggestion[] = []
  for (const recipe of ctx.recipes) {
    if (recipe.deletedAt || recipe.status !== 'approved') continue
    const effort = recipeEffort(recipe)
    if (!energyAllows(effort, energy)) continue
    const availability = recipeAvailability(recipe, matchCtx, ctx.today)
    if (!passesFilters(recipe, availability, ctx.filters)) continue
    const block = oldestBlock(recipe.id, ctx)
    const modes: SuggestionMode[] = []
    if (block && ctx.modes.has('freezer_first')) modes.push('freezer_first')
    if (availability.completeness === 1 && ctx.modes.has('make_now')) modes.push('make_now')
    if (availability.expiringItems.length > 0 && availability.completeness >= 0.5 && ctx.modes.has('use_it_up')) modes.push('use_it_up')
    if (availability.missing.length >= 1 && availability.missing.length <= 2 && ctx.modes.has('almost_there')) modes.push('almost_there')
    if (modes.length === 0) continue
    const { score, terms } = scoreRecipe(recipe, availability, ctx)
    const subs = applySubstitutions(recipe.ingredients, ruleCtx, ctx.personId ?? null)
    if (subs.unresolved.length && !ctx.filters?.search) continue
    const mode = MODE_ORDER.find((m) => modes.includes(m))!
    let cost: number | null = null
    try {
      cost = recipe.costPerServingCents ?? costPerServingCents(availability.ingredients, recipe.baseYield, ctx.prices, ctx.today)
    } catch {
      cost = null
    }
    out.push({
      recipe,
      mode,
      score: block && mode === 'freezer_first' ? round(FREEZER_FIRST_SCORE + (terms.find((t) => t.key === 'freshness')?.value ?? 0)) : score,
      terms,
      availability,
      missing: availability.missing,
      expiringUsed: availability.expiringItems,
      freezerBlock: block,
      substitutions: subs.substitutions,
      allergyBlocks: subs.unresolved,
      costPerServingCents: cost,
      effortScore: effort,
    })
  }
  // Variants: keep only the best of a family.
  const families = new Map<string, Suggestion[]>()
  for (const s of out) {
    const parent = s.recipe.variantOfRecipeId && byId.has(s.recipe.variantOfRecipeId) ? s.recipe.variantOfRecipeId : s.recipe.id
    families.set(parent, [...(families.get(parent) ?? []), s])
  }
  const deduped = [...families.values()].map((group) => group.sort((a, b) => b.score - a.score)[0]!)
  if (ctx.filters?.cheapest) {
    return deduped.sort((a, b) => (a.costPerServingCents ?? Number.POSITIVE_INFINITY) - (b.costPerServingCents ?? Number.POSITIVE_INFINITY) || b.score - a.score || a.recipe.title.localeCompare(b.recipe.title))
  }
  return deduped.sort((a, b) => b.score - a.score || a.recipe.title.localeCompare(b.recipe.title))
}

/** Allergy violations for a recipe without substitution, for the recipe card badge. */
export function recipeAllergyViolations(recipe: RecipeWithIngredients, ctx: Pick<SuggestionContext, 'rules' | 'persons' | 'personId'>): AllergyViolation[] {
  return allergyViolations(recipe.ingredients, { rules: ctx.rules, persons: ctx.persons }, ctx.personId ?? null)
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}
