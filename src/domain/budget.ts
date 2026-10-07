import type { Household, ListSend, Price, RecipeIngredient, Spend, SpendCategory } from './types'
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
  /** Estimated minus actual for sends that have both, so drift is visible. */
  driftCents: number
}

/** Spent = actual spend rows in the month; committed = estimated totals of sends still ordered; remaining = cap minus both. */
export function monthSummary(_spend: Spend[], _sends: ListSend[], _household: Pick<Household, 'budgetMonthlyCents' | 'budgetWarnPct'>, _month: string): MonthSummary {
  throw new Error('not implemented: monthSummary')
}

export interface PriceQuote {
  price: Price
  /** True when observed more than 7 days ago. */
  stale: boolean
  /** True for seeded "starter" estimates that no receipt or manual entry has confirmed. */
  starter: boolean
}

/** Latest price for an item: at the retailer first, then any retailer. Null when none. */
export function priceFor(_itemId: string, _retailerId: string | null, _prices: Price[], _today: string): PriceQuote | null {
  throw new Error('not implemented: priceFor')
}

/** Cost per serving from resolved ingredients and prices; null if any required ingredient lacks a price or a convertible unit. */
export function costPerServingCents(
  _ingredients: (IngredientAvailability | { ingredient: RecipeIngredient; item: null })[],
  _baseYield: number,
  _prices: Price[],
  _today: string,
): number | null {
  throw new Error('not implemented: costPerServingCents')
}

/** Months (YYYY-MM) from `month` back `count` months, oldest first. */
export function monthsBack(_month: string, _count: number): string[] {
  throw new Error('not implemented: monthsBack')
}
