import type { Batch, Item, ItemAlias, ItemCategory, ItemRetailerLink, ListLine, ListReason, PlanEntry, Price, RecipeWithIngredients, Retailer, RoutingRule } from './types'
import { CATEGORY_LABEL, FOOD_CATEGORIES } from './types'
import { addQuantities, compareQuantities, convert, formatQuantity, itemQuantity, normalizeUnit, unitDimension, type Quantity } from './units'
import { canonicalName } from './names'
import { matchIngredient, findItemByName } from './matching'
import { deriveStatus, needsRestock } from './status'
import { priceFor, priceForAmount } from './budget'

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
  buy: Quantity | null
  explanation: string
}

export interface MergeResult {
  lines: ListLine[]
  added: ListLine[]
  updated: ListLine[]
}

/** Ingredient needs for the plan entries and batches in a date range, scaled by servings and batch multipliers. */
export function planNeeds(
  entries: PlanEntry[],
  batches: Batch[],
  recipes: RecipeWithIngredients[],
  ctx: { items: Item[]; aliases: ItemAlias[]; alwaysHave: Set<string> },
  range: { from: string; to: string },
): Need[] {
  const out: Need[] = []
  const byId = new Map(recipes.map((r) => [r.id, r] as const))
  const push = (recipe: RecipeWithIngredients, multiplier: number, reason: ListReason) => {
    for (const ing of recipe.ingredients) {
      if (ing.deletedAt || ing.optional) continue
      const m = matchIngredient(ing, ctx)
      if (m.via === 'always_have') continue
      const item = m.itemId ? (ctx.items.find((i) => i.id === m.itemId) ?? null) : null
      out.push({
        itemId: item?.id ?? null,
        name: item?.name ?? ing.ingredientName,
        canonicalName: item?.canonicalName ?? ing.canonicalName ?? canonicalName(ing.ingredientName),
        qty: ing.amount !== null && ing.amount !== undefined ? { amount: ing.amount * multiplier, unit: normalizeUnit(ing.unit) } : null,
        reason: { ...reason, text: reason.text ?? recipe.title },
        category: item?.category ?? null,
      })
    }
  }
  for (const e of entries) {
    if (e.deletedAt || e.status !== 'planned' || e.kind !== 'recipe' || !e.recipeId) continue
    if (e.date < range.from || e.date > range.to) continue
    const r = byId.get(e.recipeId)
    if (!r) continue
    const mult = e.servings && r.baseYield > 0 ? e.servings / r.baseYield : 1
    push(r, mult, { kind: 'plan', ref: e.id })
  }
  for (const b of batches) {
    if (b.deletedAt || b.status !== 'planned') continue
    if (b.scheduledOn && (b.scheduledOn < range.from || b.scheduledOn > range.to)) continue
    const r = byId.get(b.recipeId)
    if (!r) continue
    push(r, b.multiplier, { kind: 'batch', ref: b.id })
  }
  return out
}

/** Needs for items that are Low or Out with auto_list on. */
export function restockNeeds(items: Item[]): Need[] {
  const out: Need[] = []
  for (const item of items) {
    if (item.deletedAt || !needsRestock(item)) continue
    const status = deriveStatus(item)
    let qty: Quantity | null = null
    if (item.trackMode === 'count') {
      const par = item.par ?? 1
      const have = item.qty ?? 0
      qty = { amount: Math.max(1, status === 'out' ? par : par - have), unit: normalizeUnit(item.unit) }
    }
    out.push({ itemId: item.id, name: item.name, canonicalName: item.canonicalName, qty, reason: { kind: status === 'out' ? 'out' : 'low', ref: item.id }, category: item.category })
  }
  return out
}

/** "need 3 lb thighs, have 1 lb, buy 2 lb", one line per need, combining needs for the same item first. */
export function subtractStock(needs: Need[], items: Item[]): SubtractionLine[] {
  // Combine needs by item (or canonical name) when units are convertible.
  const groups: { key: string; needs: Need[]; qty: Quantity | null; qtyUnknown: boolean }[] = []
  for (const n of needs) {
    const key = n.itemId ?? `name:${n.canonicalName}`
    let g = groups.find((x) => x.key === key)
    if (!g) {
      g = { key, needs: [], qty: null, qtyUnknown: false }
      groups.push(g)
    }
    g.needs.push(n)
    if (n.qty) {
      if (g.qty === null && !g.qtyUnknown) g.qty = n.qty
      else if (g.qty) {
        const sum = addQuantities(g.qty, n.qty)
        if (sum) g.qty = sum
        else g.qtyUnknown = true
      }
    }
  }
  const out: SubtractionLine[] = []
  for (const g of groups) {
    const first = g.needs[0]!
    const item = first.itemId ? (items.find((i) => i.id === first.itemId) ?? null) : null
    const kinds = new Set(g.needs.map((n) => n.reason.kind))
    const restockOnly = [...kinds].every((k) => k === 'low' || k === 'out')
    const need: Need = { ...first, qty: g.qty, reason: first.reason }
    if (g.qtyUnknown) {
      // Mixed units that cannot be summed: list each need separately.
      for (const n of g.needs) out.push(subtractOne(n, item, items))
      continue
    }
    if (restockOnly) {
      out.push({ need, item, have: item ? itemQuantity(item) : null, buy: g.qty ?? (item && item.trackMode === 'count' ? { amount: item.par ?? 1, unit: normalizeUnit(item.unit) } : null), explanation: first.reason.kind === 'out' ? `${need.name} is out` : `${need.name} is running low` })
      continue
    }
    out.push(subtractOne(need, item, items))
  }
  return out
}

function subtractOne(need: Need, item: Item | null, items: Item[]): SubtractionLine {
  const resolved = item ?? (need.itemId ? (items.find((i) => i.id === need.itemId) ?? null) : null)
  const needText = need.qty ? formatQuantity(need.qty) : need.name
  if (!resolved) {
    return { need, item: null, have: null, buy: need.qty ?? { amount: 1, unit: null }, explanation: `need ${needText}, none in the pantry` }
  }
  if (resolved.trackMode === 'status') {
    const status = deriveStatus(resolved)
    if (status === 'ok') return { need, item: resolved, have: null, buy: null, explanation: `${resolved.name}: have it` }
    if (status === 'low') return { need, item: resolved, have: null, buy: need.qty ?? { amount: 1, unit: null }, explanation: `${resolved.name}: running low, buy ${needText}` }
    return { need, item: resolved, have: null, buy: need.qty ?? { amount: 1, unit: null }, explanation: `${resolved.name}: out, buy ${needText}` }
  }
  const have = itemQuantity(resolved) ?? { amount: resolved.qty ?? 0, unit: normalizeUnit(resolved.unit) }
  if (!need.qty) {
    if (have.amount > 0) return { need, item: resolved, have, buy: null, explanation: `${resolved.name}: have ${formatQuantity(have)}` }
    return { need, item: resolved, have, buy: { amount: resolved.par ?? 1, unit: have.unit }, explanation: `${resolved.name}: out, buy ${formatQuantity({ amount: resolved.par ?? 1, unit: have.unit })}` }
  }
  const cmp = compareQuantities(have, need.qty)
  if (cmp.result === 'enough') return { need, item: resolved, have, buy: null, explanation: `need ${needText}, have ${formatQuantity(have)}, have enough` }
  if (cmp.result === 'short') return { need, item: resolved, have, buy: cmp.shortfall, explanation: `need ${needText}, have ${formatQuantity(have)}, buy ${formatQuantity(cmp.shortfall)}` }
  if (have.amount > 0) return { need, item: resolved, have, buy: null, explanation: `need ${needText}, have ${formatQuantity(have)} (different units; assuming enough)` }
  return { need, item: resolved, have, buy: need.qty, explanation: `need ${needText}, none in the pantry` }
}

/** Merge subtraction lines into the open list: one line per item, reasons appended, quantity the max of existing and new. */
export function mergeIntoList(existing: ListLine[], lines: SubtractionLine[], ctx: { householdId: string; now: string; newId: () => string }): MergeResult {
  const open = existing.filter((l) => !l.deletedAt && l.status === 'open')
  const keyOf = (itemId: string | null, name: string) => itemId ?? `name:${name.trim().toLowerCase()}`
  const byKey = new Map(open.map((l) => [keyOf(l.itemId, l.name), l] as const))
  const added: ListLine[] = []
  const updated: ListLine[] = []
  let position = open.reduce((m, l) => Math.max(m, l.position), -1) + 1
  for (const s of lines) {
    const key = keyOf(s.item?.id ?? s.need.itemId, s.need.name)
    const current = byKey.get(key)
    const isRestock = s.need.reason.kind === 'low' || s.need.reason.kind === 'out'
    if (s.buy === null && !(isRestock && !current)) continue
    if (current) {
      const reasons = current.reasons.slice()
      if (!reasons.some((r) => r.kind === s.need.reason.kind && r.ref === s.need.reason.ref)) reasons.push(s.need.reason)
      let qty = current.qty
      let unit = current.unit
      if (s.buy) {
        if (current.qty === null) {
          qty = s.buy.amount
          unit = s.buy.unit
        } else {
          const conv = convert(s.buy, normalizeUnit(current.unit))
          if (conv) qty = Math.max(current.qty, conv.amount)
          else if (normalizeUnit(current.unit) === s.buy.unit) qty = Math.max(current.qty, s.buy.amount)
        }
      }
      const next: ListLine = { ...current, reasons, qty, unit, updatedAt: ctx.now }
      byKey.set(key, next)
      if (!updated.some((u) => u.id === next.id)) updated.push(next)
      else updated.splice(updated.findIndex((u) => u.id === next.id), 1, next)
      continue
    }
    const line: ListLine = {
      id: ctx.newId(),
      householdId: ctx.householdId,
      createdAt: ctx.now,
      createdBy: null,
      updatedAt: ctx.now,
      updatedBy: null,
      deletedAt: null,
      itemId: s.item?.id ?? s.need.itemId,
      name: s.item?.name ?? s.need.name,
      qty: s.buy?.amount ?? null,
      unit: s.buy?.unit ?? null,
      reasons: [s.need.reason],
      retailerId: null,
      status: 'open',
      listSendId: null,
      searchTerm: null,
      priceCentsEst: null,
      note: null,
      position: position++,
    }
    byKey.set(key, line)
    added.push(line)
  }
  const lines2 = [...byKey.values()].sort((a, b) => a.position - b.position)
  return { lines: lines2, added, updated }
}

/** Destination for a line: item routing rule, then item link, then category rule, then primary grocery (food) or primary other, else null. */
export function routeLine(
  line: Pick<ListLine, 'itemId' | 'name'>,
  ctx: { items: Item[]; retailers: Retailer[]; routingRules: RoutingRule[]; links: ItemRetailerLink[] },
): string | null {
  const retailers = ctx.retailers.filter((r) => !r.deletedAt)
  const live = (id: string) => retailers.some((r) => r.id === id)
  const rules = ctx.routingRules.filter((r) => !r.deletedAt).sort((a, b) => b.priority - a.priority)
  let item = line.itemId ? (ctx.items.find((i) => i.id === line.itemId) ?? null) : null
  if (!item && line.name) {
    const m = findItemByName(line.name, { items: ctx.items, aliases: [], alwaysHave: new Set() })
    item = m.itemId ? (ctx.items.find((i) => i.id === m.itemId) ?? null) : null
  }
  if (item) {
    const itemRule = rules.find((r) => r.matchKind === 'item' && r.matchValue === item!.id && live(r.retailerId))
    if (itemRule) return itemRule.retailerId
    const link = ctx.links.find((l) => !l.deletedAt && l.itemId === item!.id && live(l.retailerId) && (l.externalId || l.searchTerm))
    if (link && rules.every((r) => !(r.matchKind === 'category' && r.matchValue === item!.category))) return link.retailerId
    const catRule = rules.find((r) => r.matchKind === 'category' && r.matchValue === item!.category && live(r.retailerId))
    if (catRule) return catRule.retailerId
    if (link) return link.retailerId
  }
  const category = item?.category ?? null
  const isFood = category ? FOOD_CATEGORIES.includes(category) : true
  const primary = retailers.find((r) => (isFood ? r.isPrimaryGrocery : r.isPrimaryOther)) ?? retailers.find((r) => r.isPrimaryGrocery) ?? null
  return primary?.id ?? null
}

/** Latest known price for the line's item, scaled to the line quantity when units allow. Null when unknown; never guess. */
export function estimateLineCents(line: ListLine, ctx: { prices: Price[]; items: Item[] }): number | null {
  if (!line.itemId) return null
  const quote = priceFor(line.itemId, line.retailerId, ctx.prices, '9999-12-31')
  if (!quote) return null
  const qty = line.qty ?? 1
  const unit = normalizeUnit(line.unit)
  const cents = priceForAmount(quote.price, qty, unit)
  if (cents !== null) return cents
  // A count line against a per-each price, or a price with no unit: multiply.
  const pUnit = normalizeUnit(quote.price.unit)
  if (pUnit === null || unitDimension(pUnit) === 'count') return Math.round(qty * quote.price.priceCents)
  return null
}

export interface DestinationGroup {
  retailer: Retailer | null
  lines: ListLine[]
  estimatedCents: number | null
  unknownPrices: number
}

/** Group open lines by destination, in retailer sort order, with an unrouted group last. */
export function groupByDestination(lines: ListLine[], retailers: Retailer[], ctx: { prices: Price[]; items: Item[] }): DestinationGroup[] {
  const live = retailers.filter((r) => !r.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder)
  const open = lines.filter((l) => !l.deletedAt && l.status === 'open').sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
  const groups: DestinationGroup[] = []
  const build = (retailer: Retailer | null, ls: ListLine[]) => {
    let est = 0
    let unknown = 0
    let any = false
    for (const l of ls) {
      const c = estimateLineCents(l, ctx)
      if (c === null) unknown++
      else {
        est += c
        any = true
      }
    }
    return { retailer, lines: ls, estimatedCents: any ? est : null, unknownPrices: unknown }
  }
  for (const r of live) {
    const ls = open.filter((l) => l.retailerId === r.id)
    if (ls.length) groups.push(build(r, ls))
  }
  const unrouted = open.filter((l) => !l.retailerId || !live.some((r) => r.id === l.retailerId))
  if (unrouted.length) groups.push(build(null, unrouted))
  return groups
}

/** Plain text list for sharing or printing, grouped by aisle order when the retailer has one. */
export function plainTextList(group: DestinationGroup, items: Item[]): string {
  const title = group.retailer?.name ?? 'Shopping list'
  const aisles = group.retailer?.config.aisleOrder ?? []
  const lineText = (l: ListLine) => `- ${l.qty ? `${formatQuantity({ amount: l.qty, unit: l.unit })} ` : ''}${l.name}${l.searchTerm ? ` (${l.searchTerm})` : ''}`
  if (!aisles.length) return `${title}\n${group.lines.map(lineText).join('\n')}`
  const sections = new Map<string, ListLine[]>()
  for (const l of group.lines) {
    const item = l.itemId ? items.find((i) => i.id === l.itemId) : null
    const cat = item?.category ?? 'other'
    const key = aisles.includes(cat) ? cat : 'other'
    sections.set(key, [...(sections.get(key) ?? []), l])
  }
  const order = [...aisles, 'other'].filter((a, i, arr) => arr.indexOf(a) === i)
  const parts = [title]
  for (const a of order) {
    const ls = sections.get(a)
    if (!ls || !ls.length) continue
    parts.push(`\n${CATEGORY_LABEL[a as ItemCategory] ?? a}`)
    parts.push(...ls.map(lineText))
  }
  return parts.join('\n')
}
