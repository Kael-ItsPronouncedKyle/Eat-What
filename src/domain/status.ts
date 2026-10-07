import { addDays, daysBetween } from './dates'
import { SHELF_LIFE_DAYS_BY_CATEGORY } from './types'
import type { Item, StockStatus } from './types'

export type ExpiryHorizon = 'expired' | 'two_days' | 'this_week' | null

/** Use-by within this many days (inclusive) counts as "expiring in 2 days". */
export const EXPIRY_TWO_DAYS = 2
/** Use-by within this many days (inclusive) counts as "expiring this week". */
export const EXPIRY_THIS_WEEK = 7

/** Plain words for each horizon. No guilt: expired food reads "compost it". */
export const EXPIRY_LABEL: Record<NonNullable<ExpiryHorizon>, string> = {
  expired: 'Past its date. Compost it.',
  two_days: 'Use in the next 2 days',
  this_week: 'Use this week',
}

/** Decimal places kept on quantities so 0.1 + 0.2 shows as 0.3, not 0.30000000000000004. */
const QTY_DECIMALS = 3

function roundQty(n: number): number {
  const factor = 10 ** QTY_DECIMALS
  return Math.round(n * factor) / factor
}

/** A count-mode quantity as a usable number: null or non-finite reads as 0. */
function qtyOf(item: Pick<Item, 'qty'>): number {
  return typeof item.qty === 'number' && Number.isFinite(item.qty) ? item.qty : 0
}

/** Count mode: qty <= 0 is Out; par set and qty < par is Low; else OK. Status mode: the stored status. */
export function deriveStatus(item: Item): StockStatus {
  if (item.trackMode !== 'count') return item.status
  const qty = qtyOf(item)
  if (qty <= 0) return 'out'
  const par = item.par
  if (typeof par === 'number' && Number.isFinite(par) && par > 0 && qty < par) return 'low'
  return 'ok'
}

/** Apply a quantity change and re-derive status (count mode). Never goes below zero. */
export function applyDelta(item: Item, delta: number): Item {
  const change = Number.isFinite(delta) ? delta : 0
  return setQuantity(item, qtyOf(item) + change)
}

/** Set an absolute quantity and re-derive status. */
export function setQuantity(item: Item, qty: number): Item {
  const safe = Number.isFinite(qty) ? qty : 0
  const next: Item = { ...item, qty: roundQty(Math.max(0, safe)) }
  next.status = deriveStatus(next)
  return next
}

/** OK -> Low -> Out -> OK. */
export function cycleStatus(status: StockStatus): StockStatus {
  switch (status) {
    case 'ok':
      return 'low'
    case 'low':
      return 'out'
    case 'out':
      return 'ok'
  }
}

/** Whole days from today until the item's use-by date; negative when it has passed. Null when there is no usable date. */
export function daysUntilUseBy(item: Pick<Item, 'useBy'>, today: string): number | null {
  if (!item.useBy) return null
  const days = daysBetween(today, item.useBy)
  return Number.isFinite(days) ? days : null
}

/** Expiry horizon against today: expired (< today), two_days (<= today + 2), this_week (<= today + 7), else null. */
export function expiryHorizon(item: Item, today: string): ExpiryHorizon {
  const days = daysUntilUseBy(item, today)
  if (days === null) return null
  if (days < 0) return 'expired'
  if (days <= EXPIRY_TWO_DAYS) return 'two_days'
  if (days <= EXPIRY_THIS_WEEK) return 'this_week'
  return null
}

/** Items that should be on the list because they are Low or Out and auto_list is on. */
export function needsRestock(item: Item): boolean {
  if (!item.autoList || item.deletedAt !== null) return false
  return deriveStatus(item) !== 'ok'
}

/** Default use-by date for a new item from its category shelf life, or null when the category has none. */
export function defaultUseBy(item: Pick<Item, 'category' | 'defaultShelfLifeDays'>, today: string): string | null {
  const own = item.defaultShelfLifeDays
  const days =
    typeof own === 'number' && Number.isFinite(own) && own > 0 ? Math.floor(own) : SHELF_LIFE_DAYS_BY_CATEGORY[item.category]
  if (days === undefined) return null
  return addDays(today, days)
}
