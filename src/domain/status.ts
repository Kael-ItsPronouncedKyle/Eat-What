import type { Item, StockStatus } from './types'

export type ExpiryHorizon = 'expired' | 'two_days' | 'this_week' | null

/** Count mode: qty <= 0 is Out; par set and qty < par is Low; else OK. Status mode: the stored status. */
export function deriveStatus(_item: Item): StockStatus {
  throw new Error('not implemented: deriveStatus')
}

/** Apply a quantity change and re-derive status (count mode). Never goes below zero. */
export function applyDelta(_item: Item, _delta: number): Item {
  throw new Error('not implemented: applyDelta')
}

/** Set an absolute quantity and re-derive status. */
export function setQuantity(_item: Item, _qty: number): Item {
  throw new Error('not implemented: setQuantity')
}

/** OK -> Low -> Out -> OK. */
export function cycleStatus(_status: StockStatus): StockStatus {
  throw new Error('not implemented: cycleStatus')
}

/** Expiry horizon against today: expired (< today), two_days (<= today + 2), this_week (<= today + 7), else null. */
export function expiryHorizon(_item: Item, _today: string): ExpiryHorizon {
  throw new Error('not implemented: expiryHorizon')
}

/** Items that should be on the list because they are Low or Out and auto_list is on. */
export function needsRestock(_item: Item): boolean {
  throw new Error('not implemented: needsRestock')
}

/** Default use-by date for a new item from its category shelf life, or null when the category has none. */
export function defaultUseBy(_item: Pick<Item, 'category' | 'defaultShelfLifeDays'>, _today: string): string | null {
  throw new Error('not implemented: defaultUseBy')
}
