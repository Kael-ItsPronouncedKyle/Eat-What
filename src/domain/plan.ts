import type { Energy, FreezerBlock, PlanEntry, RecipeWithIngredients } from './types'
import type { Suggestion } from './suggestions'

export interface PlanChange {
  entry: PlanEntry
  /** New values to apply to the entry (date, status). */
  patch: Partial<PlanEntry>
  text: string
}

export interface BadDayResult {
  changes: PlanChange[]
  /** The new entry for tonight, if one is promoted. */
  tonight: Omit<PlanEntry, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'deletedAt'> | null
  message: string
}

/** Bad day: move today's cook forward a day, shifting later cooks until a free day; promote the oldest fitting freezer block
    (or a no-cook recipe) into tonight. Never scolds. */
export function badDay(
  _entries: PlanEntry[],
  _today: string,
  _ctx: { freezerBlocks: FreezerBlock[]; recipes: RecipeWithIngredients[]; householdId: string; personId?: string | null },
): BadDayResult {
  throw new Error('not implemented: badDay')
}

export interface AutoFillOptions {
  days: string[]
  slot?: PlanEntry['slot']
  freezerNights?: number
  budgetCents?: number | null
  energy?: Energy | null
  /** Avoid repeating a recipe within this many days. */
  noRepeatDays?: number
}

export interface AutoFillProposal {
  slots: { date: string; suggestion: Suggestion | null; freezerBlock: FreezerBlock | null; note: string | null }[]
  estimatedCents: number | null
  /** True when some slots could not be filled under the constraints. */
  partial: boolean
}

/** Fill open slots from ranked suggestions; freezer nights take the oldest blocks; cheap week prefers lowest cost per serving under the target. */
export function autoFill(_suggestions: Suggestion[], _existing: PlanEntry[], _freezerBlocks: FreezerBlock[], _opts: AutoFillOptions): AutoFillProposal {
  throw new Error('not implemented: autoFill')
}

/** Entries for a date, grouped by slot then position, with a person tag preserved. */
export function entriesForDay(_entries: PlanEntry[], _date: string): PlanEntry[] {
  throw new Error('not implemented: entriesForDay')
}
