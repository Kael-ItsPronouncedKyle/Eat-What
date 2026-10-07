import type { Household, ListSend, Price, RecipeIngredient, Spend, SpendCategory } from './types'
import { daysBetween, monthKey } from './dates'
import { convert, normalizeUnit, unitDimension } from './units'
import type { IngredientAvailability } from './matching'

export interface MonthSummary {
  month: string
  capCents: number | null
  spentCents: number
  committedCents: number
  remainingCents: number | null
  pct: number | null
  level: 'ok' | 'warn' | 'over' | 'no_cap'
  byCategory: Record<SpendCategory, number>
  driftCents: number
}

export const STALE_DAYS = 7

const EMPTY_CATEGORIES = (): Record<SpendCategory, number> => ({ groceries: 0, cleaning: 0, household: 0, pet: 0, pharmacy: 0, other: 0 })

/** Spent = actual spend rows in the month; committed = estimated totals of sends still ordered; remaining = cap minus both. */
export function monthSummary(spend: Spend[], sends: ListSend[], household: Pick<Household, 'budgetMonthlyCents' | 'budgetWarnPct'>, month: string): MonthSummary {
  const byCategory = EMPTY_CATEGORIES()
  let spentCents = 0
  for (const s of spend) {
    if (s.deletedAt || s.kind !== 'actual' || monthKey(s.occurredOn) !== month) continue
    spentCents += s.amountCents
    byCategory[s.category] = (byCategory[s.category] ?? 0) + s.amountCents
  }
  let committedCents = 0
  let driftCents = 0
  for (const s of sends) {
    if (s.deletedAt || monthKey(s.sentAt.slice(0, 10)) !== month) continue
    if (s.status === 'ordered') committedCents += s.estimatedTotalCents ?? 0
    if (s.estimatedTotalCents !== null && s.actualTotalCents !== null) driftCents += s.estimatedTotalCents - s.actualTotalCents
  }
  const cap = household.budgetMonthlyCents
  if (cap === null || cap === undefined || cap <= 0) {
    return { month, capCents: null, spentCents, committedCents, remainingCents: null, pct: null, level: 'no_cap', byCategory, driftCents }
  }
  const used = spentCents + committedCents
  const pct = (used / cap) * 100
  const warn = household.budgetWarnPct ?? 80
  const level = pct >= 100 ? 'over' : pct >= warn ? 'warn' : 'ok'
  return { month, capCents: cap, spentCents, committedCents, remainingCents: cap - used, pct, level, byCategory, driftCents }
}

export interface PriceQuote {
  price: Price
  stale: boolean
  starter: boolean
}

/** Latest price for an item: at the retailer first, then any retailer. Null when none. */
export function priceFor(itemId: string, retailerId: string | null, prices: Price[], today: string): PriceQuote | null {
  const live = prices.filter((p) => !p.deletedAt && p.itemId === itemId)
  const newest = (list: Price[]) => list.slice().sort((a, b) => b.observedOn.localeCompare(a.observedOn) || b.createdAt.localeCompare(a.createdAt))[0] ?? null
  const pick = (retailerId ? newest(live.filter((p) => p.retailerId === retailerId)) : null) ?? newest(live)
  if (!pick) return null
  return { price: pick, stale: daysBetween(pick.observedOn, today) > STALE_DAYS, starter: pick.source === 'starter' }
}

/** Cents for `amount unit` of an ingredient given a price per `unitQty unit`. Null when units cannot be related. */
export function priceForAmount(price: Price, amount: number, unit: string | null): number | null {
  const unitQty = price.unitQty && price.unitQty > 0 ? price.unitQty : 1
  const pUnit = normalizeUnit(price.unit)
  const iUnit = normalizeUnit(unit)
  if (pUnit === iUnit || (pUnit === null && iUnit === null)) return Math.round((amount / unitQty) * price.priceCents)
  if (pUnit === null || iUnit === null) {
    // One side is a bare count ("each"); treat a bare count against a count unit as equal.
    const other = pUnit ?? iUnit
    if (other && unitDimension(other) === 'count') return Math.round((amount / unitQty) * price.priceCents)
    return null
  }
  const converted = convert({ amount, unit: iUnit }, pUnit)
  if (!converted) return null
  return Math.round((converted.amount / unitQty) * price.priceCents)
}

/** Cost per serving from resolved ingredients and prices; null if any required ingredient lacks a price or a convertible unit. */
export function costPerServingCents(
  ingredients: (IngredientAvailability | { ingredient: RecipeIngredient; item: null })[],
  baseYield: number,
  prices: Price[],
  today: string,
): number | null {
  if (!(baseYield > 0)) return null
  let total = 0
  for (const row of ingredients) {
    const ing = row.ingredient
    if (ing.deletedAt) continue
    if (ing.optional) continue
    const item = row.item
    if (!item) {
      const av = row as IngredientAvailability
      if (av.status === 'assumed' && av.match?.via === 'always_have') continue
      return null
    }
    if (ing.amount === null || ing.amount === undefined) {
      // No amount (e.g. "salt to taste"): skip only if it is a pantry assumption; else unknown.
      if (item.alwaysHave) continue
      return null
    }
    const quote = priceFor(item.id, null, prices, today)
    if (!quote) return null
    const cents = priceForAmount(quote.price, ing.amount, ing.unit)
    if (cents === null) return null
    total += cents
  }
  return Math.round(total / baseYield)
}

/** Months (YYYY-MM) from `month` back `count` months, oldest first, including `month`. */
export function monthsBack(month: string, count: number): string[] {
  const [y, m] = month.split('-').map(Number)
  const out: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date((y ?? 1970), (m ?? 1) - 1 - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}
