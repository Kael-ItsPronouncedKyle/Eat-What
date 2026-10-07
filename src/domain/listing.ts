import type { Batch, Item, ItemAlias, ItemCategory, ItemRetailerLink, ListLine, ListReason, PlanEntry, Price, RecipeWithIngredients, Retailer, RoutingRule } from './types'
import type { Quantity } from './units'

export interface Need {
  itemId: string | null
  name: string
  canonicalName: string
  qty: Quantity | null
  reason: ListReason
  category: ItemCategory | null
}

export interface SubtractionLine {
  need: Need
  item: Item | null
  have: Quantity | null
  /** What to buy after subtracting stock; null means "status item that is OK, nothing to buy". */
  buy: Quantity | null
  explanation: string
}

export interface MergeResult {
  /** Full list after merge, open lines only. */
  lines: ListLine[]
  added: ListLine[]
  updated: ListLine[]
}

/** Ingredient needs for the plan entries and batches in a date range, scaled by servings and batch multipliers. */
export function planNeeds(
  _entries: PlanEntry[],
  _batches: Batch[],
  _recipes: RecipeWithIngredients[],
  _ctx: { items: Item[]; aliases: ItemAlias[]; alwaysHave: Set<string> },
  _range: { from: string; to: string },
): Need[] {
  throw new Error('not implemented: planNeeds')
}

/** Needs for items that are Low or Out with auto_list on. Out needs par (or 1); Low needs par minus qty (or 1). */
export function restockNeeds(_items: Item[]): Need[] {
  throw new Error('not implemented: restockNeeds')
}

/** "need 3 lb thighs, have 1 lb, buy 2 lb", one line per need, combining needs for the same item first. */
export function subtractStock(_needs: Need[], _items: Item[]): SubtractionLine[] {
  throw new Error('not implemented: subtractStock')
}

/** Merge subtraction lines into the open list: one line per item, reasons appended, quantity is the max of existing and new. */
export function mergeIntoList(_existing: ListLine[], _lines: SubtractionLine[], _ctx: { householdId: string; now: string; newId: () => string }): MergeResult {
  throw new Error('not implemented: mergeIntoList')
}

/** Destination for a line: item override link, then item routing rule, then category rule, then primary grocery (food) or primary other, else null. */
export function routeLine(
  _line: Pick<ListLine, 'itemId' | 'name'>,
  _ctx: { items: Item[]; retailers: Retailer[]; routingRules: RoutingRule[]; links: ItemRetailerLink[] },
): string | null {
  throw new Error('not implemented: routeLine')
}

/** Latest known price for the line's item at its retailer (or any retailer), scaled to the line quantity when units allow. Null when unknown; never guess. */
export function estimateLineCents(_line: ListLine, _ctx: { prices: Price[]; items: Item[] }): number | null {
  throw new Error('not implemented: estimateLineCents')
}

export interface DestinationGroup {
  retailer: Retailer | null
  lines: ListLine[]
  estimatedCents: number | null
  /** Count of lines with no price. */
  unknownPrices: number
}

/** Group open lines by destination, in retailer sort order, with an "In person / unrouted" group last. */
export function groupByDestination(_lines: ListLine[], _retailers: Retailer[], _ctx: { prices: Price[]; items: Item[] }): DestinationGroup[] {
  throw new Error('not implemented: groupByDestination')
}

/** Plain text list for sharing or printing, grouped by aisle order when the retailer has one. */
export function plainTextList(_group: DestinationGroup, _items: Item[]): string {
  throw new Error('not implemented: plainTextList')
}
