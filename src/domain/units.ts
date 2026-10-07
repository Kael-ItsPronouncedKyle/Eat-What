import type { Item } from './types'

export type Dimension = 'mass' | 'volume' | 'count'

export interface Quantity {
  amount: number
  /** Normalized unit (see normalizeUnit) or null for a bare count. */
  unit: string | null
}

export type Comparison =
  | { result: 'enough'; surplus: Quantity }
  | { result: 'short'; shortfall: Quantity }
  | { result: 'unknown'; reason: 'incompatible_units' | 'no_amount' }

/* ------------------------------------------------------------------------------------------------
   Unit table
   ------------------------------------------------------------------------------------------------ */

interface UnitDef {
  dimension: Dimension
  /**
   * Conversion factor to the dimension's base: ml for volume, g for mass, "each" for count.
   * Count units are their own thing (a can is not a bottle); only each and dozen carry a factor.
   */
  factor: number | null
  /** Word shown after an amount above 1 ("2 cups", "2 lb", "2 boxes"). */
  plural: string
  /** Render amounts as cooking fractions (1/2, 1/3, 1/4, 1/8). Off for metric, which reads better as decimals. */
  fractions: boolean
}

const TSP_ML = 4.92892159375
const OZ_G = 28.349523125

const UNITS: Record<string, UnitDef> = {
  // volume (base ml)
  tsp: { dimension: 'volume', factor: TSP_ML, plural: 'tsp', fractions: true },
  tbsp: { dimension: 'volume', factor: TSP_ML * 3, plural: 'tbsp', fractions: true },
  'fl oz': { dimension: 'volume', factor: TSP_ML * 6, plural: 'fl oz', fractions: true },
  cup: { dimension: 'volume', factor: TSP_ML * 48, plural: 'cups', fractions: true },
  pint: { dimension: 'volume', factor: TSP_ML * 96, plural: 'pints', fractions: true },
  quart: { dimension: 'volume', factor: TSP_ML * 192, plural: 'quarts', fractions: true },
  gallon: { dimension: 'volume', factor: TSP_ML * 768, plural: 'gallons', fractions: true },
  ml: { dimension: 'volume', factor: 1, plural: 'ml', fractions: false },
  l: { dimension: 'volume', factor: 1000, plural: 'l', fractions: false },
  pinch: { dimension: 'volume', factor: TSP_ML / 16, plural: 'pinches', fractions: true },
  dash: { dimension: 'volume', factor: TSP_ML / 8, plural: 'dashes', fractions: true },
  // mass (base g)
  oz: { dimension: 'mass', factor: OZ_G, plural: 'oz', fractions: true },
  lb: { dimension: 'mass', factor: OZ_G * 16, plural: 'lb', fractions: true },
  g: { dimension: 'mass', factor: 1, plural: 'g', fractions: false },
  kg: { dimension: 'mass', factor: 1000, plural: 'kg', fractions: false },
  // count (base each; most count units do not convert)
  each: { dimension: 'count', factor: 1, plural: 'each', fractions: true },
  dozen: { dimension: 'count', factor: 12, plural: 'dozen', fractions: true },
  can: { dimension: 'count', factor: null, plural: 'cans', fractions: true },
  bottle: { dimension: 'count', factor: null, plural: 'bottles', fractions: true },
  bag: { dimension: 'count', factor: null, plural: 'bags', fractions: true },
  box: { dimension: 'count', factor: null, plural: 'boxes', fractions: true },
  roll: { dimension: 'count', factor: null, plural: 'rolls', fractions: true },
  pack: { dimension: 'count', factor: null, plural: 'packs', fractions: true },
  clove: { dimension: 'count', factor: null, plural: 'cloves', fractions: true },
  slice: { dimension: 'count', factor: null, plural: 'slices', fractions: true },
  stick: { dimension: 'count', factor: null, plural: 'sticks', fractions: true },
  head: { dimension: 'count', factor: null, plural: 'heads', fractions: true },
  bunch: { dimension: 'count', factor: null, plural: 'bunches', fractions: true },
  jar: { dimension: 'count', factor: null, plural: 'jars', fractions: true },
  loaf: { dimension: 'count', factor: null, plural: 'loaves', fractions: true },
  piece: { dimension: 'count', factor: null, plural: 'pieces', fractions: true },
  sprig: { dimension: 'count', factor: null, plural: 'sprigs', fractions: true },
  stalk: { dimension: 'count', factor: null, plural: 'stalks', fractions: true },
  ear: { dimension: 'count', factor: null, plural: 'ears', fractions: true },
  carton: { dimension: 'count', factor: null, plural: 'cartons', fractions: true },
  tub: { dimension: 'count', factor: null, plural: 'tubs', fractions: true },
  tray: { dimension: 'count', factor: null, plural: 'trays', fractions: true },
  cube: { dimension: 'count', factor: null, plural: 'cubes', fractions: true },
  scoop: { dimension: 'count', factor: null, plural: 'scoops', fractions: true },
  sheet: { dimension: 'count', factor: null, plural: 'sheets', fractions: true },
  pouch: { dimension: 'count', factor: null, plural: 'pouches', fractions: true },
  case: { dimension: 'count', factor: null, plural: 'cases', fractions: true },
  fillet: { dimension: 'count', factor: null, plural: 'fillets', fractions: true },
  link: { dimension: 'count', factor: null, plural: 'links', fractions: true },
  serving: { dimension: 'count', factor: null, plural: 'servings', fractions: true },
}

/** canonical -> every spelling we accept (lowercase, periods removed). */
const SPELLINGS: [string, string[]][] = [
  ['tsp', ['tsp', 'tsps', 't', 'teaspoon', 'teaspoons', 'tea spoon', 'tea spoons']],
  ['tbsp', ['tbsp', 'tbsps', 'tbs', 'tbl', 'tblsp', 'tblsps', 'tablespoon', 'tablespoons', 'table spoon', 'table spoons']],
  ['fl oz', ['fl oz', 'floz', 'fluid ounce', 'fluid ounces', 'fl ounce', 'fl ounces', 'fluid oz']],
  ['cup', ['cup', 'cups', 'c']],
  ['pint', ['pint', 'pints', 'pt', 'pts']],
  ['quart', ['quart', 'quarts', 'qt', 'qts']],
  ['gallon', ['gallon', 'gallons', 'gal', 'gals']],
  ['ml', ['ml', 'mls', 'milliliter', 'milliliters', 'millilitre', 'millilitres', 'cc']],
  ['l', ['l', 'liter', 'liters', 'litre', 'litres', 'ltr', 'ltrs']],
  ['pinch', ['pinch', 'pinches']],
  ['dash', ['dash', 'dashes']],
  ['oz', ['oz', 'ozs', 'ounce', 'ounces']],
  ['lb', ['lb', 'lbs', 'pound', 'pounds', '#']],
  ['g', ['g', 'gm', 'gms', 'gr', 'gram', 'grams']],
  ['kg', ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms']],
  ['each', ['each', 'ea', 'ct', 'count', 'unit', 'units', 'item', 'items', 'whole']],
  ['dozen', ['dozen', 'dozens', 'doz', 'dz']],
  ['can', ['can', 'cans', 'tin', 'tins']],
  ['bottle', ['bottle', 'bottles', 'btl', 'btls']],
  ['bag', ['bag', 'bags']],
  ['box', ['box', 'boxes']],
  ['roll', ['roll', 'rolls']],
  ['pack', ['pack', 'packs', 'pk', 'pkg', 'pkgs', 'package', 'packages', 'packet', 'packets']],
  ['clove', ['clove', 'cloves']],
  ['slice', ['slice', 'slices']],
  ['stick', ['stick', 'sticks']],
  ['head', ['head', 'heads']],
  ['bunch', ['bunch', 'bunches']],
  ['jar', ['jar', 'jars']],
  ['loaf', ['loaf', 'loaves']],
  ['piece', ['piece', 'pieces', 'pc', 'pcs']],
  ['sprig', ['sprig', 'sprigs']],
  ['stalk', ['stalk', 'stalks']],
  ['ear', ['ear', 'ears']],
  ['carton', ['carton', 'cartons']],
  ['tub', ['tub', 'tubs']],
  ['tray', ['tray', 'trays']],
  ['cube', ['cube', 'cubes']],
  ['scoop', ['scoop', 'scoops']],
  ['sheet', ['sheet', 'sheets']],
  ['pouch', ['pouch', 'pouches']],
  ['case', ['case', 'cases']],
  ['fillet', ['fillet', 'fillets', 'filet', 'filets']],
  ['link', ['link', 'links']],
  ['serving', ['serving', 'servings', 'portion', 'portions']],
]

const ALIASES: Record<string, string> = {}
for (const [canonical, spellings] of SPELLINGS) {
  for (const s of spellings) ALIASES[s] = canonical
}

/** Every canonical unit this module knows, in table order. */
export const KNOWN_UNITS: readonly string[] = Object.keys(UNITS)

export function isKnownUnit(unit: string | null | undefined): boolean {
  const u = normalizeUnit(unit)
  return u !== null && u in UNITS
}

/* ------------------------------------------------------------------------------------------------
   Normalization
   ------------------------------------------------------------------------------------------------ */

function cleanKey(raw: string): string {
  return raw.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim()
}

/** Known spellings only; null for anything else. Case matters for the lone T (tablespoon) and t (teaspoon). */
function lookupUnit(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === 'T') return 'tbsp'
  if (trimmed === 't') return 'tsp'
  const key = cleanKey(trimmed)
  if (key === '') return null
  return ALIASES[key] ?? ALIASES[key.replace(/ /g, '')] ?? null
}

function singularize(word: string): string {
  if (word.length <= 3) return word
  if (/(ss|us|is)$/.test(word)) return word
  if (/(x|z|ch|sh|ss)es$/.test(word)) return word.slice(0, -2)
  if (word.endsWith('s')) return word.slice(0, -1)
  return word
}

function pluralizeWord(word: string): string {
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`
  return `${word}s`
}

/**
 * Map any spelling ("lbs", "pound", "Tbsp", "tablespoons", "ea") to one canonical unit; null for empty.
 * A spelling we do not know passes through lowercased, trimmed and singular ("Trays" -> "tray"),
 * so household-specific units still compare with themselves.
 */
export function normalizeUnit(unit: string | null | undefined): string | null {
  if (unit === null || unit === undefined) return null
  const raw = unit.trim()
  if (raw === '') return null
  const known = lookupUnit(raw)
  if (known !== null) return known
  return singularize(cleanKey(raw))
}

export function unitDimension(unit: string | null): Dimension {
  const u = normalizeUnit(unit)
  if (u === null) return 'count'
  return UNITS[u]?.dimension ?? 'count'
}

/** Round away floating-point noise (16.000000000000004 -> 16) and turn -0 into 0. */
function tidy(n: number): number {
  if (!Number.isFinite(n)) return n
  const t = parseFloat(n.toPrecision(12))
  return t === 0 ? 0 : t
}

/* ------------------------------------------------------------------------------------------------
   Conversion and comparison
   ------------------------------------------------------------------------------------------------ */

/**
 * Convert between units of the same dimension; null when the dimensions differ.
 * Count units only convert to themselves, except each and dozen (12 each). A null unit is a bare
 * count that only matches another null unit.
 */
export function convert(q: Quantity, toUnit: string | null): Quantity | null {
  const from = normalizeUnit(q.unit)
  const to = normalizeUnit(toUnit)
  if (from === to) return { amount: q.amount, unit: to }
  if (from === null || to === null) return null
  const fromDef = UNITS[from]
  const toDef = UNITS[to]
  if (fromDef === undefined || toDef === undefined) return null
  if (fromDef.dimension !== toDef.dimension) return null
  if (fromDef.factor === null || toDef.factor === null) return null
  return { amount: tidy((q.amount * fromDef.factor) / toDef.factor), unit: to }
}

/** Compare what we have with what we need, in the need's unit when possible. */
export function compareQuantities(have: Quantity, need: Quantity): Comparison {
  if (!Number.isFinite(have.amount) || !Number.isFinite(need.amount)) return { result: 'unknown', reason: 'no_amount' }
  const needUnit = normalizeUnit(need.unit)
  const got = convert(have, needUnit)
  if (got === null) return { result: 'unknown', reason: 'incompatible_units' }
  const diff = tidy(got.amount - need.amount)
  if (diff >= 0) return { result: 'enough', surplus: { amount: diff, unit: needUnit } }
  return { result: 'short', shortfall: { amount: tidy(-diff), unit: needUnit } }
}

export function addQuantities(a: Quantity, b: Quantity): Quantity | null {
  const unit = normalizeUnit(a.unit)
  const added = convert(b, unit)
  if (added === null) return null
  return { amount: tidy(a.amount + added.amount), unit }
}

/** The quantity an item currently holds: null for status-mode items (and for count items with no number yet). */
export function itemQuantity(item: Item): Quantity | null {
  if (item.trackMode !== 'count') return null
  if (item.qty === null || !Number.isFinite(item.qty)) return null
  return { amount: item.qty, unit: normalizeUnit(item.unit) }
}

/* ------------------------------------------------------------------------------------------------
   Formatting
   ------------------------------------------------------------------------------------------------ */

const FRACTIONS: [number, string][] = [
  [1 / 8, '1/8'],
  [1 / 4, '1/4'],
  [1 / 3, '1/3'],
  [3 / 8, '3/8'],
  [1 / 2, '1/2'],
  [5 / 8, '5/8'],
  [2 / 3, '2/3'],
  [3 / 4, '3/4'],
  [7 / 8, '7/8'],
]
/** How close an amount must be to a cooking fraction to be shown as one (safely under half the smallest gap). */
const FRACTION_TOLERANCE = 0.02

function formatDecimal(abs: number): string {
  if (abs > 0 && abs < 0.01) return String(parseFloat(abs.toPrecision(2)))
  return abs.toFixed(2).replace(/\.?0+$/, '')
}

function formatAmount(amount: number, allowFractions: boolean): string {
  if (!Number.isFinite(amount)) return ''
  const sign = amount < 0 ? '-' : ''
  const abs = Math.abs(amount)
  if (allowFractions) {
    let whole = Math.floor(abs)
    let frac = abs - whole
    if (frac > 1 - FRACTION_TOLERANCE) {
      whole += 1
      frac = 0
    }
    if (frac < FRACTION_TOLERANCE) {
      if (whole > 0 || abs === 0) return `${sign}${whole}`
    } else {
      const match = FRACTIONS.find(([value]) => Math.abs(frac - value) <= FRACTION_TOLERANCE)
      if (match !== undefined) return whole > 0 ? `${sign}${whole} ${match[1]}` : `${sign}${match[1]}`
    }
  }
  return `${sign}${formatDecimal(abs)}`
}

/** The unit word for an amount: singular for amounts up to 1 ("1/2 cup", "1 can"), plural above ("2 cups"). */
export function unitLabel(unit: string | null, amount: number): string {
  const u = normalizeUnit(unit)
  if (u === null) return ''
  if (amount > 0 && amount <= 1) return u
  const def = UNITS[u]
  return def !== undefined ? def.plural : pluralizeWord(u)
}

/** "2 lb", "1.5 cups", "3", "1/2 tsp" rendered for people: fractions for small cooking amounts, no trailing zeros. */
export function formatQuantity(q: Quantity): string {
  const unit = normalizeUnit(q.unit)
  const def = unit === null ? undefined : UNITS[unit]
  const allowFractions = def === undefined ? true : def.fractions
  const amountText = formatAmount(q.amount, allowFractions)
  if (unit === null) return amountText
  return `${amountText} ${unitLabel(unit, q.amount)}`
}

/* ------------------------------------------------------------------------------------------------
   Parsing
   ------------------------------------------------------------------------------------------------ */

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  half: 0.5,
  couple: 2,
}

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
}

const PART_WORDS: Record<string, number> = { half: 0.5, quarter: 0.25, third: 1 / 3 }

interface NumberMatch {
  value: number
  /** Index just past the number in the source string. */
  end: number
}

/** Digits, fractions, mixed numbers, unicode fractions, ranges, and number words at the start of the text. */
function parseLeadingNumber(s: string): NumberMatch | null {
  const base = parseBareNumber(s)
  if (base === null) return null
  // "one and a half", "2 and a quarter"
  const tail = /^ and (?:a |one )?(half|quarter|third)(?=\s|$)/i.exec(s.slice(base.end))
  if (tail !== null) {
    const part = PART_WORDS[(tail[1] ?? '').toLowerCase()] ?? 0
    return { value: tidy(base.value + part), end: base.end + tail[0].length }
  }
  return base
}

function parseBareNumber(s: string): NumberMatch | null {
  // 1 1/2, 1-1/2
  let m = /^(\d+)[ -](\d+)\/(\d+)(?![\d/])/.exec(s)
  if (m !== null) {
    const den = Number(m[3])
    if (den > 0) return { value: tidy(Number(m[1]) + Number(m[2]) / den), end: m[0].length }
  }
  // 1/2
  m = /^(\d+)\/(\d+)(?![\d/])/.exec(s)
  if (m !== null) {
    const den = Number(m[2])
    if (den > 0) return { value: tidy(Number(m[1]) / den), end: m[0].length }
  }
  // 1½, ½
  m = /^(\d+)?([½⅓⅔¼¾⅛⅜⅝⅞])/.exec(s)
  if (m !== null) {
    const whole = m[1] !== undefined ? Number(m[1]) : 0
    return { value: tidy(whole + (UNICODE_FRACTIONS[m[2] ?? ''] ?? 0)), end: m[0].length }
  }
  // 2-3, 2 to 3: the low end of a range
  m = /^(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)(?![\d/.])/i.exec(s)
  if (m !== null) return { value: Number(m[1]), end: m[0].length }
  // 2, 1.5, .5
  m = /^(\d+(?:\.\d+)?|\.\d+)(?![\d/])/.exec(s)
  if (m !== null) return { value: Number(m[0]), end: m[0].length }
  // a, an, one .. twelve, half, couple
  m = /^(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|couple)(?=\s|$)/i.exec(s)
  if (m === null) return null
  const word = (m[1] ?? '').toLowerCase()
  let value = NUMBER_WORDS[word] ?? 1
  let end = m[0].length
  const after = s.slice(end)
  if (word === 'a' || word === 'an') {
    // "a few eggs", "a lot of rice": no number here
    if (/^ (few|little|lot|bit|bunch of)(?=\s|$)/i.test(after)) return null
    // "a half cup"
    const half = /^ half(?=\s|$)/i.exec(after)
    if (half !== null) return { value: 0.5, end: end + half[0].length }
    // "a couple of eggs"
    const couple = /^ couple(?: of)?(?=\s|$)/i.exec(after)
    if (couple !== null) return { value: 2, end: end + couple[0].length }
    // "a 12-pack of paper towels": the number that follows wins
    const gap = /^ +(?=\d)/.exec(after)
    if (gap !== null) {
      const inner = parseBareNumber(after.slice(gap[0].length))
      if (inner !== null) return { value: inner.value, end: end + gap[0].length + inner.end }
    }
  } else if (word === 'half') {
    // "half a cup", "half of an onion"
    const article = /^ (?:of )?(?:a|an)(?=\s|$)/i.exec(after)
    if (article !== null) end += article[0].length
  } else if (word === 'couple') {
    const of = /^ of(?=\s|$)/i.exec(after)
    if (of !== null) end += of[0].length
    value = 2
  }
  return { value, end }
}

interface UnitMatch {
  unit: string
  /** Index just past the unit in the source string. */
  end: number
}

/** A known unit spelling (up to three words) at the start of the text; trailing punctuation is ignored. */
function takeUnit(r: string): UnitMatch | null {
  const tokenRe = /\S+/g
  const tokens: { start: number; end: number }[] = []
  let m: RegExpExecArray | null
  while (tokens.length < 3 && (m = tokenRe.exec(r)) !== null) tokens.push({ start: m.index, end: m.index + m[0].length })
  const first = tokens[0]
  if (first === undefined) return null
  for (let n = tokens.length; n >= 1; n -= 1) {
    const last = tokens[n - 1]
    if (last === undefined) continue
    const phrase = r.slice(first.start, last.end).replace(/[.,;:)]+$/, '')
    const unit = lookupUnit(phrase)
    if (unit !== null) return { unit, end: last.end }
  }
  return null
}

function cleanRest(r: string): string {
  return r
    .replace(/^\s*of(?=\s|$)/i, '')
    .replace(/^[\s,;:-]+/, '')
    .trim()
}

/**
 * Parse "2 cans black beans", "a bottle of Dawn", "1/2 lb thighs", "12-pack of paper towels" into amount, unit,
 * and the remaining name. Returns null for a bare name ("eggs"). "two bags of rice" works for one through twelve.
 * A unit with no number counts as one only when "of" follows it ("can of tomatoes"), so "can opener" stays a name.
 */
export function parseQuantity(text: string): { amount: number; unit: string | null; rest: string } | null {
  const s = text.replace(/\s+/g, ' ').trim()
  if (s === '') return null
  const num = parseLeadingNumber(s)
  if (num === null) {
    const lead = takeUnit(s)
    if (lead === null) return null
    const after = s.slice(lead.end)
    if (lead.unit === 'dozen' || /^\s*of(?=\s|$)/i.test(after)) return { amount: 1, unit: lead.unit, rest: cleanRest(after) }
    return null
  }
  let r = s.slice(num.end)
  // "12-pack" joins the number to its unit; "2-ply" does not, and then the whole thing is just a name
  let hyphenated = false
  if (r.startsWith('-')) {
    hyphenated = true
    r = r.slice(1)
  }
  r = r.replace(/^\s+/, '').replace(/^x(?=\s)/i, '').replace(/^\s+/, '')
  const unit = takeUnit(r)
  if (unit === null) {
    if (hyphenated) return null
    return { amount: num.value, unit: null, rest: cleanRest(r) }
  }
  return { amount: num.value, unit: unit.unit, rest: cleanRest(r.slice(unit.end)) }
}
