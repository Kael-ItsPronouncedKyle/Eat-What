import { addDays, parseDateKey } from './dates'
import { QUALITY_DAYS_DEFAULT } from './types'
import type { Container, ContainerKind, FoodType, FreezerBlock, HouseholdSettings, Person, Recipe } from './types'

export type LabelFormat = 'tape' | 'bag' | 'sheet'

type LabelBlock = Pick<FreezerBlock, 'title' | 'portionLabel' | 'servingsPerBlock' | 'cookedOn' | 'qualityUntil' | 'foodType'>
type LabelOpts = { recipe?: Recipe | null; person?: Person | null; container?: Container | null; format: LabelFormat }

/** Separator between the parts of one label line. */
export const LABEL_SEPARATOR = ' · '

/** Reheat line used when the recipe has no note for the container kind. `other` also covers "no container". */
export const REHEAT_LINE_DEFAULTS: Record<ContainerKind, string> = {
  bag: 'Thaw in fridge overnight, then heat on the stove',
  tub: 'Microwave 3 to 4 min, stir halfway',
  pan: 'Oven 350°F from frozen, covered, 45 to 60 min',
  tray: 'Pop the block out, microwave or stovetop',
  jar: 'Thaw in fridge; do not microwave the jar',
  muffin_tin: 'Microwave 1 to 2 min from frozen, or warm in the oven',
  other: 'Thaw in fridge overnight, then heat until hot all the way through',
}

/** Label text: recipe, portions, date, person, reheat line. Tape is one line, bag panel three lines, sheet five lines. */
export function labelText(block: LabelBlock, opts: LabelOpts): string {
  return labelLines(block, opts).join('\n')
}

/** The same label as separate lines (tape 1, bag 3, sheet 5), for callers that lay lines out themselves. */
export function labelLines(block: LabelBlock, opts: LabelOpts): string[] {
  const title = oneLine(block.title) || oneLine(opts.recipe?.title) || 'Freezer meal'
  const portion = oneLine(block.portionLabel) || null
  const servings = servingsText(block.servingsPerBlock)
  const person = oneLine(opts.person?.name) || null
  const cooked = formatLabelDate(block.cookedOn)
  const bestBy = bestByText(block)
  const reheat = reheatLine(opts.recipe, opts.container)

  switch (opts.format) {
    case 'tape':
      return [joinParts([title, portion ?? servings, cooked, person])]
    case 'bag':
      return [joinParts([title, portion, person]), datesLine(cooked, bestBy), reheat]
    case 'sheet':
      return [title, joinParts([portion, servings]) || 'Portion ____', datesLine(cooked, bestBy), person ? `For ${person}` : 'For anyone', reheat]
  }
}

/** Quality date from the cook date and food type, using household overrides, else QUALITY_DAYS_DEFAULT. */
export function qualityUntil(cookedOn: string, foodType: FoodType, settings?: HouseholdSettings | null): string {
  const key = dateKeyOf(cookedOn)
  if (!key) throw new Error('Cook date must be a date like 2026-10-07')
  return addDays(key, qualityDays(foodType, settings))
}

/** Days a food type keeps its quality: the household override when it is a positive number, else the default. */
export function qualityDays(foodType: FoodType, settings?: HouseholdSettings | null): number {
  const override = settings?.qualityDays?.[foodType]
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) return Math.round(override)
  return QUALITY_DAYS_DEFAULT[foodType]
}

/** Reheat line for the container kind, from the recipe's reheat notes, else a sensible default per kind. */
export function reheatLine(recipe: Recipe | null | undefined, container: Container | null | undefined): string {
  const kind: ContainerKind = container?.kind ?? 'other'
  const note = oneLine(recipe?.reheatNotes?.[kind]?.text)
  return note || REHEAT_LINE_DEFAULTS[kind]
}

/** Guess a food type from a recipe's title and tags (soup, stew, chili -> soup; etc.). */
export function guessFoodType(recipe: Pick<Recipe, 'title' | 'tags' | 'mealType'>): FoodType {
  const words = titleWords(recipe.title)
  const has = (list: readonly string[]) => list.some((w) => words.has(w))
  // Title words first: "dump kit" and "marinated" say the food is still raw, whatever else the title says.
  if (has(RAW_WORDS)) return 'raw_marinated'
  if (has(SOUP_WORDS)) return 'soup'
  if (has(SAUCE_WORDS)) return 'sauce'
  if (has(GRAIN_WORDS)) return 'grain'
  if (has(BAKED_WORDS)) return 'baked'
  // A dump-kit tag on a plain title ("Honey garlic crockpot bags") still means raw.
  if ((recipe.tags ?? []).includes('dump_kit')) return 'raw_marinated'
  if (has(MEAT_WORDS)) return 'cooked_meat'
  if (has(VEGETABLE_WORDS)) return 'vegetable'
  if (recipe.mealType === 'dessert') return 'baked'
  return 'other'
}

/** "Oct 7" for a YYYY-MM-DD key (or an ISO timestamp); null when the date is missing or malformed. */
export function formatLabelDate(date: string | null | undefined): string | null {
  const key = dateKeyOf(date)
  if (!key) return null
  const d = parseDateKey(key)
  const month = MONTHS[d.getMonth()]
  if (!month) return null
  return `${month} ${d.getDate()}`
}

/* ------------------------------------------------------------------------------------------------
   Internals
   ------------------------------------------------------------------------------------------------ */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

const RAW_WORDS = ['marinated', 'marinade', 'dump', 'kit', 'packet']
const SOUP_WORDS = ['soup', 'stew', 'chili', 'broth', 'stock', 'chowder', 'bisque', 'gumbo', 'curry', 'ramen', 'pho']
const SAUCE_WORDS = ['sauce', 'gravy', 'marinara', 'pesto', 'ragu', 'bolognese', 'salsa']
const GRAIN_WORDS = ['rice', 'bean', 'grain', 'oatmeal', 'oat', 'quinoa', 'lentil', 'pasta', 'noodle', 'polenta', 'grit']
const BAKED_WORDS = [
  'muffin', 'cookie', 'bread', 'bite', 'biscuit', 'scone', 'brownie', 'cake', 'loaf', 'roll', 'bagel', 'waffle', 'pancake', 'puck',
  'burrito', 'sandwich', 'dough', 'pastry', 'pie',
]
const MEAT_WORDS = [
  'chicken', 'beef', 'pork', 'turkey', 'sausage', 'brisket', 'steak', 'lamb', 'ham', 'bacon', 'meatball', 'meatloaf', 'meat',
  'roast', 'rib', 'wing', 'thigh', 'drumstick', 'pulled', 'carnitas', 'barbacoa', 'chorizo', 'shrimp', 'fish', 'salmon', 'tilapia', 'cod',
]
const VEGETABLE_WORDS = ['vegetable', 'veggie', 'veg', 'broccoli', 'carrot', 'squash', 'cauliflower', 'greens', 'potato', 'sweet-potato']

/** Lowercase title words, each also present without a trailing s or es so plurals match the singular lists. */
function titleWords(title: string): Set<string> {
  const out = new Set<string>()
  for (const raw of (title ?? '').toLowerCase().split(/[^a-z-]+/)) {
    if (!raw) continue
    out.add(raw)
    if (raw.endsWith('es')) out.add(raw.slice(0, -2))
    if (raw.endsWith('s')) out.add(raw.slice(0, -1))
    for (const part of raw.split('-')) if (part) out.add(part)
  }
  return out
}

function oneLine(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

function joinParts(parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => !!p && p.length > 0).join(LABEL_SEPARATOR)
}

function servingsText(n: number): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null
  const shown = Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)
  return `${shown} ${n === 1 ? 'serving' : 'servings'}`
}

function datesLine(cooked: string | null, bestBy: string | null): string {
  return `Cooked ${cooked ?? '____'}${LABEL_SEPARATOR}Best by ${bestBy ?? '____'}`
}

function bestByText(block: LabelBlock): string | null {
  const stored = formatLabelDate(block.qualityUntil)
  if (stored) return stored
  const cooked = dateKeyOf(block.cookedOn)
  return cooked ? formatLabelDate(qualityUntil(cooked, block.foodType)) : null
}

/** YYYY-MM-DD from a date key or an ISO timestamp; null for anything else. */
function dateKeyOf(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|T| )/.exec(value.trim())
  if (!m) return null
  const key = `${m[1]}-${m[2]}-${m[3]}`
  const d = parseDateKey(key)
  if (Number.isNaN(d.getTime())) return null
  // Reject rolled-over dates like 2026-02-31.
  return d.getMonth() + 1 === Number(m[2]) && d.getDate() === Number(m[3]) ? key : null
}
