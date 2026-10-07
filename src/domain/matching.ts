import type { Item, ItemAlias, Recipe, RecipeIngredient, RecipeWithIngredients } from './types'
import { canonicalName, nameSimilarity } from './names'
import { compareQuantities, itemQuantity, type Quantity } from './units'
import { deriveStatus, expiryHorizon } from './status'

export interface MatchContext {
  items: Item[]
  aliases: ItemAlias[]
  alwaysHave: Set<string>
}

export type MatchVia = 'resolved' | 'alias' | 'exact' | 'fuzzy' | 'always_have' | 'none'

export interface MatchResult {
  itemId: string | null
  confidence: number
  via: MatchVia
}

export type AvailabilityStatus = 'have' | 'short' | 'missing' | 'optional_missing' | 'assumed'

export interface IngredientAvailability {
  ingredient: RecipeIngredient
  match: MatchResult
  item: Item | null
  status: AvailabilityStatus
  shortfall: Quantity | null
  low: boolean
}

export interface RecipeAvailability {
  recipe: Recipe
  ingredients: IngredientAvailability[]
  completeness: number
  missing: IngredientAvailability[]
  expiringItems: Item[]
}

export const FUZZY_THRESHOLD = 0.8

const liveItems = (ctx: MatchContext) => ctx.items.filter((i) => !i.deletedAt)

function matchByName(name: string, ctx: MatchContext): MatchResult {
  const canon = canonicalName(name)
  if (!canon) return { itemId: null, confidence: 0, via: 'none' }
  const items = liveItems(ctx)
  const lowerRaw = name.trim().toLowerCase()
  // Aliases: exact text, case-insensitive, raw or canonical.
  for (const a of ctx.aliases) {
    if (a.deletedAt) continue
    const al = a.alias.trim().toLowerCase()
    if (al === lowerRaw || al === canon || canonicalName(a.alias) === canon) {
      if (items.some((i) => i.id === a.itemId)) return { itemId: a.itemId, confidence: 0.97, via: 'alias' }
    }
  }
  const exact = items.find((i) => i.canonicalName === canon || canonicalName(i.name) === canon)
  if (exact) return { itemId: exact.id, confidence: 1, via: 'exact' }
  let best: { item: Item; score: number } | null = null
  for (const i of items) {
    const s = nameSimilarity(canon, i.canonicalName || canonicalName(i.name))
    if (s >= FUZZY_THRESHOLD && (!best || s > best.score)) best = { item: i, score: s }
  }
  if (best) return { itemId: best.item.id, confidence: best.score, via: 'fuzzy' }
  if (ctx.alwaysHave.has(canon)) return { itemId: null, confidence: 0.9, via: 'always_have' }
  return { itemId: null, confidence: 0, via: 'none' }
}

/** Resolve one ingredient to an item: resolved item_id, then alias, then exact canonical name, then fuzzy >= 0.8, then always-have. */
export function matchIngredient(ingredient: RecipeIngredient, ctx: MatchContext): MatchResult {
  if (ingredient.itemId && liveItems(ctx).some((i) => i.id === ingredient.itemId)) {
    return { itemId: ingredient.itemId, confidence: ingredient.matchConfidence ?? 1, via: 'resolved' }
  }
  const name = ingredient.canonicalName || ingredient.ingredientName
  const r = matchByName(name, ctx)
  if (r.via !== 'none') return r
  if (ingredient.ingredientName !== name) return matchByName(ingredient.ingredientName, ctx)
  return r
}

/** Find the item a free-text name refers to (voice, receipt, list add): alias, exact, then fuzzy. */
export function findItemByName(name: string, ctx: MatchContext): MatchResult {
  return matchByName(name, ctx)
}

/** Availability of one ingredient against stock. */
export function ingredientAvailability(ingredient: RecipeIngredient, ctx: MatchContext, _today: string, servingsMultiplier = 1): IngredientAvailability {
  const match = matchIngredient(ingredient, ctx)
  const item = match.itemId ? (liveItems(ctx).find((i) => i.id === match.itemId) ?? null) : null
  const base = { ingredient, match, item }
  if (!item) {
    if (match.via === 'always_have') return { ...base, status: 'assumed', shortfall: null, low: false }
    return { ...base, status: ingredient.optional ? 'optional_missing' : 'missing', shortfall: null, low: false }
  }
  const status = deriveStatus(item)
  const low = status === 'low'
  if (item.trackMode === 'status') {
    if (status === 'out') return { ...base, status: ingredient.optional ? 'optional_missing' : 'missing', shortfall: null, low: false }
    return { ...base, status: 'have', shortfall: null, low }
  }
  const have = itemQuantity(item) ?? { amount: item.qty ?? 0, unit: item.unit }
  if ((have.amount ?? 0) <= 0) return { ...base, status: ingredient.optional ? 'optional_missing' : 'missing', shortfall: null, low: false }
  if (ingredient.amount === null || ingredient.amount === undefined) return { ...base, status: 'have', shortfall: null, low }
  const need: Quantity = { amount: ingredient.amount * servingsMultiplier, unit: ingredient.unit }
  const cmp = compareQuantities(have, need)
  if (cmp.result === 'enough') return { ...base, status: 'have', shortfall: null, low }
  if (cmp.result === 'short') return { ...base, status: ingredient.optional ? 'optional_missing' : 'short', shortfall: cmp.shortfall, low }
  return { ...base, status: 'assumed', shortfall: null, low }
}

export function recipeAvailability(recipe: RecipeWithIngredients, ctx: MatchContext, today: string, servingsMultiplier = 1): RecipeAvailability {
  const ingredients = recipe.ingredients.filter((i) => !i.deletedAt).map((i) => ingredientAvailability(i, ctx, today, servingsMultiplier))
  const required = ingredients.filter((a) => !a.ingredient.optional)
  const good = required.filter((a) => a.status === 'have' || a.status === 'assumed').length
  const completeness = required.length === 0 ? 1 : good / required.length
  const missing = required.filter((a) => a.status === 'missing' || a.status === 'short')
  const seen = new Set<string>()
  const expiringItems: Item[] = []
  for (const a of ingredients) {
    if (!a.item || seen.has(a.item.id)) continue
    const h = expiryHorizon(a.item, today)
    if (h === 'two_days' || h === 'this_week' || h === 'expired') {
      seen.add(a.item.id)
      expiringItems.push(a.item)
    }
  }
  return { recipe, ingredients, completeness, missing, expiringItems }
}
