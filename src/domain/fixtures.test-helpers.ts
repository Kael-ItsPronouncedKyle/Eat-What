/* Shared fixtures for domain tests. Not a test file itself. */
import type { Container, FreezerBlock, Item, ItemAlias, ListLine, PlanEntry, Price, Recipe, RecipeIngredient, RecipeWithIngredients, Retailer, RoutingRule, Rule, Person, TenantRow } from './types'

let seq = 0
export const id = (prefix = 'id') => `${prefix}-${++seq}`
export const HID = 'house-1'
export const NOW = '2026-10-07T12:00:00.000Z'
export const TODAY = '2026-10-07'

export function row(overrides: Partial<TenantRow> = {}): TenantRow {
  return { id: id(), householdId: HID, createdAt: NOW, createdBy: null, updatedAt: NOW, updatedBy: null, deletedAt: null, ...overrides }
}

export function item(o: Partial<Item> & { name: string }): Item {
  const canonical = o.canonicalName ?? o.name.toLowerCase().replace(/s$/, '')
  return { ...row(), canonicalName: canonical, category: 'pantry', locationId: null, trackMode: 'status', status: 'ok', qty: null, unit: null, par: null, useBy: null, barcode: null, imagePath: null, alwaysHave: false, autoList: true, personId: null, defaultShelfLifeDays: null, notes: null, sortOrder: 0, ...o }
}

export function countItem(name: string, qty: number, unit: string | null, par: number | null = null, o: Partial<Item> = {}): Item {
  const status = qty <= 0 ? 'out' : par !== null && qty < par ? 'low' : 'ok'
  return item({ name, trackMode: 'count', qty, unit, par, status, ...o })
}

export function ingredient(recipeId: string, name: string, amount: number | null, unit: string | null, o: Partial<RecipeIngredient> = {}): RecipeIngredient {
  return { ...row(), recipeId, position: 0, ingredientName: name, canonicalName: o.canonicalName ?? name.toLowerCase().replace(/s$/, ''), amount, unit, preparation: null, optional: false, groupLabel: null, substitute: null, itemId: null, matchConfidence: null, fdcId: null, grams: null, ...o }
}

export function recipe(o: Partial<Recipe> & { title: string }): Recipe {
  return { ...row(), libraryId: null, variantOfRecipeId: null, variantLabel: null, description: null, cuisine: null, mealType: 'dinner', baseYield: 4, yieldUnit: 'servings', steps: [], freezeNotes: null, reheatNotes: {}, plateNotes: {}, equipment: [], tags: [], activeMinutes: 20, standingMinutes: 10, totalMinutes: 40, dishesCount: 2, effortScore: 2, nutrition: null, costPerServingCents: null, source: 'manual', sourceUrl: null, status: 'approved', imagePath: null, lastCookedAt: null, timesCooked: 0, ...o }
}

export function recipeWith(o: Partial<Recipe> & { title: string }, ings: [string, number | null, string | null, Partial<RecipeIngredient>?][]): RecipeWithIngredients {
  const r = recipe(o)
  return { ...r, ingredients: ings.map(([n, a, u, extra], i) => ingredient(r.id, n, a, u, { position: i, ...(extra ?? {}) })) }
}

export function rule(type: Rule['type'], payload: Rule['payload'], appliesToPersonId: string | null = null): Rule {
  return { ...row(), type, payload, appliesToPersonId, active: true }
}

export function person(name: string, o: Partial<Person> = {}): Person {
  return { ...row(), name, userId: null, plateProfile: {}, color: null, sortOrder: 0, ...o }
}

export function block(title: string, o: Partial<FreezerBlock> = {}): FreezerBlock {
  return { ...row(), recipeId: null, batchId: null, containerId: null, locationId: null, title, portionLabel: '1-cup', portionMl: 240, servingsPerBlock: 1, countRemaining: 2, countInitial: 2, personId: null, cookedOn: '2026-09-01', qualityUntil: '2026-11-30', freezerSpot: null, foodType: 'soup', labelText: null, notes: null, ...o }
}

export function container(name: string, kind: Container['kind'], capacityMl: number, countOwned: number, o: Partial<Container> = {}): Container {
  return { ...row(), name, kind, capacityMl, countOwned, disposable: kind === 'bag', ovenSafe: kind === 'pan', microwaveSafe: kind === 'tub', sortOrder: 0, ...o }
}

export function price(itemId: string, priceCents: number, o: Partial<Price> = {}): Price {
  return { ...row(), itemId, retailerId: null, priceCents, unitQty: 1, unit: null, source: 'manual', observedOn: TODAY, receiptId: null, note: null, ...o }
}

export function retailer(name: string, kind: Retailer['kind'], o: Partial<Retailer> = {}): Retailer {
  return { ...row(), name, kind, config: {}, isPrimaryGrocery: false, isPrimaryOther: false, sortOrder: 0, ...o }
}

export function routing(matchKind: RoutingRule['matchKind'], matchValue: string, retailerId: string): RoutingRule {
  return { ...row(), matchKind, matchValue, retailerId, priority: 0 }
}

export function line(name: string, o: Partial<ListLine> = {}): ListLine {
  return { ...row(), itemId: null, name, qty: null, unit: null, reasons: [{ kind: 'manual' }], retailerId: null, status: 'open', listSendId: null, searchTerm: null, priceCentsEst: null, note: null, position: 0, ...o }
}

export function entry(date: string, o: Partial<PlanEntry> = {}): PlanEntry {
  return { ...row(), date, slot: 'dinner', kind: 'recipe', recipeId: null, freezerBlockId: null, batchId: null, personId: null, note: null, servings: null, position: 0, status: 'planned', ...o }
}

export function alias(itemId: string, text: string, o: Partial<ItemAlias> = {}): ItemAlias {
  return { ...row(), itemId, alias: text, source: 'manual', retailerId: null, ...o }
}
