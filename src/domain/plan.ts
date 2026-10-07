import type { Energy, FreezerBlock, PlanEntry, RecipeWithIngredients } from './types'
import { addDays } from './dates'
import type { Suggestion } from './suggestions'

export interface PlanChange {
  entry: PlanEntry
  patch: Partial<PlanEntry>
  text: string
}

export interface BadDayResult {
  changes: PlanChange[]
  tonight: Omit<PlanEntry, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'deletedAt'> | null
  message: string
}

const SLOT_ORDER: PlanEntry['slot'][] = ['breakfast', 'lunch', 'dinner', 'snack', 'batch']

const isCook = (e: PlanEntry) => !e.deletedAt && e.status === 'planned' && (e.kind === 'recipe' || e.kind === 'batch')

/** Bad day: move today's cook forward a day, shifting later cooks until a free day; promote the oldest fitting freezer block
    (or a no-cook recipe) into tonight. Never scolds. */
export function badDay(
  entries: PlanEntry[],
  today: string,
  ctx: { freezerBlocks: FreezerBlock[]; recipes: RecipeWithIngredients[]; householdId: string; personId?: string | null },
): BadDayResult {
  const live = entries.filter((e) => !e.deletedAt)
  const changes: PlanChange[] = []
  const titleOf = (e: PlanEntry) => ctx.recipes.find((r) => r.id === e.recipeId)?.title ?? e.note ?? 'Tonight\'s cook'
  const todaysCooks = live.filter((e) => e.date === today && isCook(e) && e.slot === 'dinner')
  // Chain: each displaced cook takes the next day; a cook already there is displaced one day further.
  const queue: { entry: PlanEntry; target: string }[] = todaysCooks.map((e) => ({ entry: e, target: addDays(today, 1) }))
  const moved = new Set<string>()
  let guard = 0
  while (queue.length && guard++ < 60) {
    const { entry: e, target } = queue.shift()!
    if (moved.has(e.id)) continue
    moved.add(e.id)
    const blocker = live.find((x) => x.id !== e.id && x.date === target && x.slot === e.slot && isCook(x) && !moved.has(x.id))
    if (blocker) queue.push({ entry: blocker, target: addDays(target, 1) })
    changes.push({ entry: e, patch: { date: target }, text: `${titleOf(e)} moved to ${target === addDays(today, 1) ? 'tomorrow' : 'the next free day'}` })
  }
  // Tonight: oldest fitting freezer block, else a no-cook recipe.
  const blocks = ctx.freezerBlocks
    .filter((b) => !b.deletedAt && b.countRemaining > 0 && b.foodType !== 'raw_marinated' && (!ctx.personId || !b.personId || b.personId === ctx.personId))
    .sort((a, b) => (a.cookedOn ?? '').localeCompare(b.cookedOn ?? '') || (a.qualityUntil ?? '').localeCompare(b.qualityUntil ?? ''))
  const block = blocks[0] ?? null
  const base = { householdId: ctx.householdId, date: today, slot: 'dinner' as const, personId: ctx.personId ?? null, servings: null, position: 99, status: 'planned' as const, batchId: null, note: null }
  if (block) {
    return {
      changes,
      tonight: { ...base, kind: 'freezer_block', recipeId: block.recipeId, freezerBlockId: block.id, note: null },
      message: `Tonight is ${block.title} from the freezer. ${changes.length ? 'The rest of the week shifted a day.' : 'Nothing else changes.'}`,
    }
  }
  const easy = ctx.recipes.find((r) => !r.deletedAt && r.status === 'approved' && (r.tags.includes('no_chop') || r.tags.includes('microwave_only')) && (r.effortScore ?? 5) <= 2)
  if (easy) {
    return { changes, tonight: { ...base, kind: 'recipe', recipeId: easy.id, freezerBlockId: null, note: null }, message: `Tonight is ${easy.title}, the easiest thing in the bank. ${changes.length ? 'The rest of the week shifted a day.' : ''}`.trim() }
  }
  return { changes, tonight: null, message: `Nothing to promote; order in or have leftovers, that's fine.${changes.length ? ' The week shifted a day.' : ''}` }
}

export interface AutoFillOptions {
  days: string[]
  slot?: PlanEntry['slot']
  freezerNights?: number
  budgetCents?: number | null
  energy?: Energy | null
  noRepeatDays?: number
}

export interface AutoFillProposal {
  slots: { date: string; suggestion: Suggestion | null; freezerBlock: FreezerBlock | null; note: string | null }[]
  estimatedCents: number | null
  partial: boolean
}

const SERVINGS_PER_NIGHT = 2

/** Fill open slots from ranked suggestions; freezer nights take the oldest blocks; cheap week prefers lowest cost under the target. */
export function autoFill(suggestions: Suggestion[], existing: PlanEntry[], freezerBlocks: FreezerBlock[], opts: AutoFillOptions): AutoFillProposal {
  const slot = opts.slot ?? 'dinner'
  const noRepeat = opts.noRepeatDays ?? 10
  const energy = opts.energy ?? null
  const allowed = suggestions.filter((s) => {
    if (energy === 'little') return (s.effortScore ?? 0) <= 2
    if (energy === 'some') return (s.effortScore ?? 0) <= 3.5
    return true
  })
  const pool = (opts.budgetCents !== null && opts.budgetCents !== undefined
    ? allowed.slice().sort((a, b) => (a.costPerServingCents ?? Number.POSITIVE_INFINITY) - (b.costPerServingCents ?? Number.POSITIVE_INFINITY) || b.score - a.score)
    : allowed
  ).filter((s) => s.mode !== 'freezer_first')
  const blocks = freezerBlocks
    .filter((b) => !b.deletedAt && b.countRemaining > 0 && b.foodType !== 'raw_marinated')
    .sort((a, b) => (a.cookedOn ?? '').localeCompare(b.cookedOn ?? '') || (a.qualityUntil ?? '').localeCompare(b.qualityUntil ?? ''))
    .map((b) => ({ block: b, left: b.countRemaining }))
  const usedRecipeDates = new Map<string, string[]>()
  for (const e of existing) if (!e.deletedAt && e.recipeId) usedRecipeDates.set(e.recipeId, [...(usedRecipeDates.get(e.recipeId) ?? []), e.date])
  const recentlyUsed = (recipeId: string, date: string) => (usedRecipeDates.get(recipeId) ?? []).some((d) => Math.abs(daysDiff(d, date)) < noRepeat)
  const slots: AutoFillProposal['slots'] = []
  let estimated = 0
  let costKnown = true
  let partial = false
  let freezerLeft = opts.freezerNights ?? 0
  for (const date of opts.days) {
    const taken = existing.some((e) => !e.deletedAt && e.date === date && e.slot === slot && e.status === 'planned')
    if (taken) continue
    if (freezerLeft > 0) {
      const b = blocks.find((x) => x.left > 0 && x.left === x.block.countRemaining) ?? blocks.find((x) => x.left > 0)
      if (b) {
        b.left -= 1
        freezerLeft -= 1
        slots.push({ date, suggestion: null, freezerBlock: b.block, note: null })
        continue
      }
    }
    const pick = pool.find((s) => !recentlyUsed(s.recipe.id, date))
    if (!pick) {
      slots.push({ date, suggestion: null, freezerBlock: null, note: 'Nothing fits; leave open or pick by hand.' })
      partial = true
      continue
    }
    const cost = pick.costPerServingCents === null ? null : pick.costPerServingCents * SERVINGS_PER_NIGHT
    if (opts.budgetCents !== null && opts.budgetCents !== undefined && cost !== null && estimated + cost > opts.budgetCents) {
      slots.push({ date, suggestion: null, freezerBlock: null, note: 'Over the dollar target; left open.' })
      partial = true
      continue
    }
    if (cost === null) costKnown = false
    else estimated += cost
    usedRecipeDates.set(pick.recipe.id, [...(usedRecipeDates.get(pick.recipe.id) ?? []), date])
    slots.push({ date, suggestion: pick, freezerBlock: null, note: null })
  }
  if (freezerLeft > 0 && (opts.freezerNights ?? 0) > 0) partial = partial || slots.every((s) => !s.freezerBlock)
  return { slots, estimatedCents: costKnown && slots.some((s) => s.suggestion) ? estimated : null, partial }
}

function daysDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by ?? 0, (bm ?? 1) - 1, bd ?? 1) - Date.UTC(ay ?? 0, (am ?? 1) - 1, ad ?? 1)) / 86_400_000)
}

/** Entries for a date, grouped by slot then position. */
export function entriesForDay(entries: PlanEntry[], date: string): PlanEntry[] {
  return entries.filter((e) => !e.deletedAt && e.date === date).sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || a.position - b.position)
}
