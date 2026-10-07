import type { Batch, Container, CookWeek, FreezerBlock, HouseholdSettings, Item, ItemAlias, Location, RecipeWithIngredients, TimelineDay, TimelineEntry, TimelineEntryKind } from './types'
import { addDays, daysBetween, formatDate } from './dates'
import { standingMinutes } from './effort'
import { guessFoodType, labelText, qualityUntil } from './labels'
import { matchIngredient } from './matching'
import { blocksAtOnce, cavitiesOf } from './containers'

/** Default standing-minute cap when the household has no prep rule. */
export const DEFAULT_MAX_STANDING_MINUTES = 20

/** Rest after a prep that runs past the standing cap. */
export const SIT_MINUTES = 10

/** Row order inside one day (spec: Cook-week timeline). */
export const TIMELINE_KIND_ORDER: readonly TimelineEntryKind[] = ['thaw', 'note', 'shop', 'batch', 'sit', 'prep', 'label', 'pop', 'refill']

/** Link text that ends the shop row. The builder shows it as a link to the list; print keeps it as plain text. */
export const SHOP_LINK_TEXT = 'Open the list'

export interface TimelineOptions {
  /** Pantry items; frozen meat among them produces thaw rows. */
  items: Item[]
  aliases?: ItemAlias[]
  /** Locations, to know which items sit in a freezer. */
  locations?: Location[]
  /** Standing-minute cap from the household prep rule. */
  maxStandingMinutes?: number
  settings?: HouseholdSettings | null
}

interface DayBatch {
  batch: Batch
  recipe: RecipeWithIngredients
}

/** True when the item is meat or seafood kept in a freezer (a freezer location or a freezer shelf). */
export function isFrozenMeat(item: Item, locations: Location[] = []): boolean {
  const meaty = item.category === 'meat' || item.category === 'seafood'
  if (!meaty) return false
  const loc = item.locationId ? locations.find((l) => l.id === item.locationId) : null
  if (!loc) return false
  if (loc.kind === 'freezer' || loc.isFreezerShelf) return true
  const parent = loc.parentId ? locations.find((l) => l.id === loc.parentId) : null
  return parent?.kind === 'freezer'
}

/** Frozen meat items a recipe needs, in ingredient order, without repeats. */
export function frozenMeatFor(recipe: RecipeWithIngredients, opts: TimelineOptions): Item[] {
  const ctx = { items: opts.items, aliases: opts.aliases ?? [], alwaysHave: new Set<string>() }
  const out: Item[] = []
  for (const ing of recipe.ingredients) {
    const m = matchIngredient(ing, ctx)
    if (!m.itemId) continue
    const item = opts.items.find((i) => i.id === m.itemId)
    if (!item || item.deletedAt || !isFrozenMeat(item, opts.locations)) continue
    if (!out.some((i) => i.id === item.id)) out.push(item)
  }
  return out
}

/** Blocks a batch fills, per container, counting only containers that exist. */
function blocksByContainer(batch: Batch, containers: Container[]): { container: Container; blocks: number }[] {
  const out: { container: Container; blocks: number }[] = []
  for (const line of batch.containerPlan) {
    const c = containers.find((x) => x.id === line.containerId && !x.deletedAt)
    if (!c || line.count <= 0) continue
    const found = out.find((o) => o.container.id === c.id)
    if (found) found.blocks += line.count
    else out.push({ container: c, blocks: line.count })
  }
  return out
}

/** A tray is a reusable container with cavities: blocks come out of it into bags so it can go again. */
export function isTray(c: Container): boolean {
  return !c.disposable && (c.kind === 'tray' || c.kind === 'muffin_tin' || cavitiesOf(c) > 1)
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

function batchText(b: Batch, r: RecipeWithIngredients): string {
  return `${r.title} ×${b.multiplier}${b.kind === 'dump_kit' ? ' (assemble, no cook)' : ''}`
}

/** Tape labels for one batch, one per container line, each with its count. */
export function batchLabelLines(b: Batch, r: RecipeWithIngredients, containers: Container[], cookedOn: string, settings?: HouseholdSettings | null): string[] {
  const foodType = guessFoodType(r)
  return b.containerPlan
    .filter((line) => line.count > 0)
    .map((line) => {
      const c = containers.find((x) => x.id === line.containerId) ?? null
      const text = labelText({ title: r.title, portionLabel: line.portionLabel, servingsPerBlock: line.portionMl >= 480 ? 2 : 1, cookedOn, qualityUntil: qualityUntil(cookedOn, foodType, settings), foodType }, { recipe: r, container: c, format: 'tape' })
      return `${text} × ${line.count}`
    })
}

/**
 * Day-by-day rows for a cook week: shop the day before the first batch, thaw frozen meat the evening before,
 * cook, sit, fill, label, then pop tray blocks into bags the next morning and refill when the same tray cooks again.
 * Pure: the caller passes the pantry and the standing cap. Batches without a day are left out; a tray counts as reused only when it cooks again by the week's end.
 */
export function buildTimeline(week: Pick<CookWeek, 'startsOn' | 'endsOn'>, batches: Batch[], recipes: RecipeWithIngredients[], containers: Container[], freezerBlocks: FreezerBlock[], opts: TimelineOptions): TimelineDay[] {
  const maxStanding = opts.maxStandingMinutes ?? DEFAULT_MAX_STANDING_MINUTES
  const days = new Map<string, TimelineEntry[]>()
  const add = (date: string, e: TimelineEntry) => days.set(date, [...(days.get(date) ?? []), e])

  const scheduled: DayBatch[] = batches
    .filter((b) => !b.deletedAt && b.scheduledOn)
    .map((b) => ({ batch: b, recipe: recipes.find((r) => r.id === b.recipeId) }))
    .filter((x): x is DayBatch => Boolean(x.recipe))
    .sort((a, b) => a.batch.scheduledOn!.localeCompare(b.batch.scheduledOn!) || a.batch.createdAt.localeCompare(b.batch.createdAt))
  if (scheduled.length === 0) return []

  const firstDay = scheduled[0]!.batch.scheduledOn!
  add(addDays(firstDay, -1), { kind: 'shop', text: `Shop for the week. One send covers every batch. ${SHOP_LINK_TEXT}.` })

  // Blocks still sitting in trays from before the week: pop them the morning of the first cook so the trays are free.
  const leftover = freezerBlocks.filter((fb) => !fb.deletedAt && fb.countRemaining > 0 && fb.containerId && fb.cookedOn && daysBetween(fb.cookedOn, firstDay) >= 0 && daysBetween(fb.cookedOn, firstDay) <= 1 && !batches.some((b) => b.id === fb.batchId))
  const leftoverInTrays = leftover.filter((fb) => { const c = containers.find((x) => x.id === fb.containerId); return c ? isTray(c) : false }).reduce((n, fb) => n + fb.countRemaining, 0)
  if (leftoverInTrays > 0) add(firstDay, { kind: 'pop', text: `Pop ${plural(leftoverInTrays, 'block')} out of trays into bags first, so the trays are free.` })

  // Which day each tray is needed, to know when a pop must also refill.
  const trayDays = new Map<string, string[]>()
  for (const { batch } of scheduled) {
    for (const { container } of blocksByContainer(batch, containers)) {
      if (!isTray(container)) continue
      trayDays.set(container.id, [...(trayDays.get(container.id) ?? []), batch.scheduledOn!])
    }
  }

  const byDay = new Map<string, DayBatch[]>()
  for (const x of scheduled) byDay.set(x.batch.scheduledOn!, [...(byDay.get(x.batch.scheduledOn!) ?? []), x])

  for (const [date, list] of byDay) {
    const thawed = new Set<string>()
    const needed = new Map<string, { container: Container; blocks: number }>()
    for (const { batch, recipe } of list) {
      for (const item of frozenMeatFor(recipe, opts)) {
        if (thawed.has(item.id)) continue
        thawed.add(item.id)
        add(addDays(date, -1), { kind: 'thaw', batchId: batch.id, text: `Move ${item.name} from freezer to fridge tonight for ${recipe.title}.` })
      }
      const standing = Math.round(standingMinutes(recipe) * Math.max(1, Math.sqrt(batch.multiplier)))
      add(date, { kind: 'batch', batchId: batch.id, text: batchText(batch, recipe), minutes: recipe.totalMinutes ?? undefined })
      if (standing > maxStanding) add(date, { kind: 'sit', batchId: batch.id, text: `Sit for ${SIT_MINUTES} minutes after the prep. ${standing} minutes standing is over your ${maxStanding} minute limit; split the batch across the day.`, minutes: SIT_MINUTES })
      else add(date, { kind: 'sit', batchId: batch.id, text: `About ${standing} minutes standing. Sit while it cooks.`, minutes: 0 })
      for (const line of batch.containerPlan) if (line.count > 0) add(date, { kind: 'prep', batchId: batch.id, text: `Fill ${line.count} × ${line.portionLabel}` })
      const labels = batchLabelLines(batch, recipe, containers, date, opts.settings)
      const blocks = batch.containerPlan.reduce((n, l) => n + Math.max(0, l.count), 0)
      if (blocks > 0) add(date, { kind: 'label', batchId: batch.id, text: `Label ${plural(blocks, 'block')}: ${labels.join('; ')}` })
      for (const { container, blocks: n } of blocksByContainer(batch, containers)) {
        const cur = needed.get(container.id)
        needed.set(container.id, { container, blocks: (cur?.blocks ?? 0) + n })
      }
    }

    // Trays: more blocks than fit at once means freeze, pop, refill the same day.
    let trayBlocks = 0
    const reusedLater: Container[] = []
    for (const { container, blocks } of needed.values()) {
      if (!isTray(container)) continue
      trayBlocks += blocks
      const fits = blocksAtOnce(container)
      if (blocks > fits) add(date, { kind: 'note', text: `${container.name}: ${blocks} blocks, ${fits} fit at once. Freeze the first ${fits}, pop them into bags, and refill.` })
      if ((trayDays.get(container.id) ?? []).some((d) => d > date && d <= week.endsOn)) reusedLater.push(container)
    }
    if (trayBlocks > 0) {
      const next = addDays(date, 1)
      add(next, { kind: 'pop', text: `Pop ${plural(trayBlocks, 'block')} out of trays into bags${reusedLater.length ? ', refill trays' : ''}.` })
      for (const c of reusedLater) {
        const nextUse = (trayDays.get(c.id) ?? []).filter((d) => d > date && d <= week.endsOn).sort()[0]!
        add(next, { kind: 'refill', text: `Refill ${c.name} for the batch on ${formatDate(nextUse, 'weekday')}.` })
      }
    }
  }

  const rank = (k: TimelineEntryKind) => TIMELINE_KIND_ORDER.indexOf(k)
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entries]) => ({ date, entries: entries.map((e, i) => ({ e, i })).sort((a, b) => rank(a.e.kind) - rank(b.e.kind) || a.i - b.i).map((x) => x.e) }))
}

/** Plain-text plan for print or copy, one line per timeline row, built from the same rows the screen shows. */
export function timelineText(name: string, timeline: TimelineDay[]): string {
  const lines: string[] = [name, '']
  for (const day of timeline) {
    lines.push(formatDate(day.date, 'long'))
    for (const e of day.entries) lines.push(`  ${TIMELINE_PREFIX[e.kind]}${e.text}${e.kind === 'batch' && e.minutes ? ` (${e.minutes} min)` : ''}`)
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}

/** Prefix per row kind in the printed plan, so a paper copy reads the same as the screen. */
export const TIMELINE_PREFIX: Record<TimelineEntryKind, string> = {
  shop: '(shop) ',
  thaw: '(thaw) ',
  note: '(note) ',
  batch: '- ',
  sit: '(sit) ',
  prep: '  fill: ',
  label: '(label) ',
  pop: '(pop) ',
  refill: '(refill) ',
}
