/* Partner intent parser, phase 1: local rules, no network.
   Turns typed or dictated text into the shared Intent union (src/domain/types). Pure: no React, no I/O, no clock; the
   caller passes `today` when it wants "what's expiring" answered. Phase 3 puts the edge function behind this same
   signature, so the sheet does not change. Spec: "AI partner and voice". */
import type { Intent, Item, ItemAlias, ItemCategory, Location, Retailer, RetailerKind, StockStatus, SuggestionFilters } from '@/domain/types'
import { CATEGORY_LABEL } from '@/domain/types'
import { convert, formatQuantity, normalizeUnit, parseQuantity, type Quantity } from '@/domain/units'
import { findItemByName, FUZZY_THRESHOLD, type MatchContext } from '@/domain/matching'
import { canonicalName, nameSimilarity } from '@/domain/names'
import { deriveStatus, expiryHorizon, EXPIRY_LABEL } from '@/domain/status'
import { formatDate } from '@/domain/dates'

/** Exact or alias match, fuzzy match, nothing in the pantry. */
export const CONFIDENCE = { exact: 0.9, fuzzy: 0.6, unknown: 0.3 } as const

export const STATUS_WORD: Record<StockStatus, string> = { ok: 'OK', low: 'Low', out: 'Out' }

export interface ParseContext {
  items: Item[]
  aliases: ItemAlias[]
  alwaysHave: Set<string>
  retailers: Retailer[]
  /** Optional. Lets summary rows say where an item lives ("Paper towels: 12 rolls (Cleaning closet)"). */
  locations?: Location[]
  /** Optional, YYYY-MM-DD. Lets "what's expiring" answer. Never read from the clock here. */
  today?: string
}

export type ChangeKind = 'add' | 'set_status' | 'consume' | 'list_add'

/** One row of the confirm list: what was said, what it matched, what applying it will do. */
export interface Change {
  key: string
  kind: ChangeKind
  /** The name as spoken, cleaned of fillers. */
  name: string
  /** The pantry item it matched, or null for something not in the pantry. */
  itemId: string | null
  confidence: number
  qty?: number
  unit?: string
  status?: StockStatus
  /** A place the person named ("in the garage"). */
  location?: string
  /** For a new item: the matched item's category, or a guess from the words. */
  category?: ItemCategory
  retailerId?: string | null
  retailerName?: string
}

export interface ParseResult {
  intents: Intent[]
  /** Plain rows, one per change or answer: "Eggs: Out", "Paper towels: 12 rolls (Cleaning closet)". */
  summary: string[]
  /** Write intents broken out per item so the sheet can show one row each and let the person fix a match. */
  changes: Change[]
}

/* ------------------------------------------------------------------------------------------------
   Word lists
   ------------------------------------------------------------------------------------------------ */

const GREETING = /^(?:(?:hey|ok|okay|hi|yo)\s+)?(?:qm|quartermaster|partner)[,:]?\s+/i
const PLEASE = /^please\s+|,?\s*please$/gi

const QUESTION_LEAD = /^(?:do|does|did|have|has|is|are|was|were|how|what|which|where|any|got any|check|tell me|show me)\b/i

const READ_ALOUD = /^(?:please\s+)?read\s+(?:me\s+)?(?:back\s+)?(?:my|the|our)?\s*(?:pantry|list|stock|inventory|low|out)\b/i

const EXPIRING = /\b(?:expir\w*|going bad|go bad|gone bad|use.?by|spoil\w*|about to turn)\b/i

const SUGGEST_ASK = /\b(?:what|which|any|some|suggest\w*|ideas?|recommend\w*|options?)\b|^(?:can|could|should)\s+(?:i|we)\b/i
const SUGGEST_TOPIC = /\b(?:make|cook|dinner|supper|lunch|breakfast|meal|eat|tonight|recipes?)\b/i

const LIST_PHRASES: RegExp[] = [
  /\s*\b(?:to|on|onto|in|for)\s+(?:the\s+|my\s+|our\s+)?(?:shopping\s+|grocery\s+|groceries\s+)?list\b/i,
  /\s*\b(?:the|my|our)\s+(?:shopping\s+|grocery\s+|groceries\s+)?list\b/i,
  /\s*\b(?:shopping|grocery|groceries)\s+list\b/i,
  /\s*\blist\s*$/i,
]
const LIST_LEAD = /^(?:(?:we|i)\s+)?(?:(?:also|still)\s+)?(?:need to get|need to buy|need|needs|should get|should buy|gotta get|gotta buy|have to get|have to buy|buy|pick up|grab|get|order)\b/i
const LIST_VERB = /^(?:(?:we|i)\s+)?(?:(?:also|still)\s+)?(?:need to get|need to buy|need|needs|should get|should buy|gotta get|gotta buy|have to get|have to buy|buy|pick up|grab|get|order)\b\s*/i

const CONSUME_LEAD = /^(?:(?:we|i|they)\s+)?(?:(?:just|already|also)\s+)?(used up|used|ate|finished off|finished|drank|went through|cooked|opened|threw out|threw away|tossed|polished off)\b\s*/i
const CONSUME_ALL = new Set(['used up', 'finished', 'finished off', 'threw out', 'threw away', 'tossed', 'polished off'])
const LAST_OF = /^(?:the\s+)?(?:last|rest|remainder)\s+of\s+(?:the\s+|our\s+|my\s+)?|^all\s+(?:of\s+)?(?:the\s+|our\s+|my\s+)?/i

const ADD_LEAD = /^(?:(?:we|i|they)\s+)?(?:(?:just|also|now)\s+)?(?:add|added|put away|put|got|bought|picked up|brought home|brought|have|restocked|restock|stocked up on|stocked|came home with|grabbed|found)\b\s*/i

const STATUS_MARKERS: { re: RegExp; status: StockStatus }[] = [
  { re: /\b(?:back in stock|restocked on|stocked up on|all good on|plenty of|is back|are back|is ok|are ok|is okay|are okay|is fine|are fine|ok again|okay again)\b/i, status: 'ok' },
  { re: /\b(?:running low on|getting low on|almost out of|nearly out of|low on|is running low|are running low|running low|getting low|almost out|nearly out|almost gone|nearly gone|is low|are low)\b/i, status: 'low' },
  { re: /\b(?:all out of|ran out of|run out of|out of|no more|don't have any more|don't have any|do not have any|is out|are out|is gone|are gone|all gone|none left|is empty|are empty)\b/i, status: 'out' },
  { re: /(?:\s+(?:is|are)|'s|'re)?\s+low$/i, status: 'low' },
  { re: /(?:\s+(?:is|are)|'s|'re)?\s+(?:out|gone|empty|finished|done)$/i, status: 'out' },
  { re: /\s+(?:again|back)$/i, status: 'ok' },
]
const STATUS_LEAD_FILLER = /^(?:(?:we're|we are|we've|we|i'm|i am|i've|i|you're|you|it's|its|it|they're|they|there's|there is|there are|is|are|the|our|my|some|any|now|and|also)\s+)+/i

const LOCATION_WORDS: [RegExp, string][] = [
  [/^(?:fridge|refrigerator)$/i, 'fridge'],
  [/^(?:deep freezer|chest freezer|freezer)$/i, 'freezer'],
  [/^pantry$/i, 'pantry'],
  [/^garage$/i, 'garage'],
  [/^bathroom$/i, 'bathroom'],
  [/^(?:cleaning closet|hall closet|closet|laundry room|laundry|under the sink)$/i, 'cleaning'],
  [/^(?:cabinet|cupboard|counter|shelf)$/i, 'pantry'],
]
const LOCATION_TAIL = /\s*\b(?:in|into|to|on|at|from)\s+(?:the\s+|our\s+|my\s+)?(fridge|refrigerator|deep freezer|chest freezer|freezer|pantry|garage|bathroom|cleaning closet|hall closet|closet|laundry room|laundry|under the sink|cabinet|cupboard|counter|shelf)\s*$/i

const NAME_LEAD_FILLER = /^(?:(?:some|any|more|a few|a couple of|a couple|a little|a bit of|a lot of|lots of|the|our|my|of|that|those|these|them|it|new)\s+)+/i
const NAME_TAIL_FILLER = /(?:\s+(?:please|now|today|again|too|also|already|anymore|though|at all|for me|for us|thanks|thank you|from the store|at the store|this week))+$/i

/** Private-use character that stands in for "and" inside a protected name while clauses are split. */
const JOIN_MARK = ''
const PROTECTED_PAIRS = ['half and half', 'mac and cheese', 'macaroni and cheese', 'peanut butter and jelly', 'sweet and sour', 'pork and beans', 'chicken and dumplings', 'biscuits and gravy', 'fish and chips']

const RETAILER_WORDS: Record<RetailerKind, string[]> = {
  instacart: ['instacart'],
  heb: ['heb', 'h-e-b', 'h e b'],
  walmart: ['walmart', 'wal-mart', 'wal mart'],
  amazon: ['amazon'],
  kroger: ['kroger', 'krogers'],
  in_person: [],
  other: [],
}

const CATEGORY_HINTS: [RegExp, ItemCategory][] = [
  [/\bfrozen\b/i, 'frozen'],
  [/\b(?:soap|detergent|bleach|cleaner|wipes?|sponges?|dawn|clorox|lysol|dishwasher|pods|windex|swiffer)\b/i, 'cleaning'],
  [/\b(?:paper towels?|toilet paper|tissues?|kleenex|napkins?|paper plates?|foil|plastic wrap|parchment|ziploc)\b/i, 'paper'],
  [/\b(?:trash bags?|garbage bags?|batteries|light ?bulbs?|candles?)\b/i, 'household'],
  [/\b(?:dog|cat|pet|litter|kibble|treats)\b/i, 'pet'],
  [/\b(?:ibuprofen|tylenol|advil|aspirin|vitamins?|medicine|band-?aids?|allergy|benadryl|zyrtec)\b/i, 'pharmacy'],
  [/\b(?:shampoo|conditioner|toothpaste|deodorant|razors?|lotion|floss|body wash)\b/i, 'personal'],
  [/\b(?:milk|cheese|cheddar|butter|yogurt|cream|eggs?|half and half)\b/i, 'dairy'],
  [/\b(?:chicken|beef|pork|turkey|sausage|bacon|ham|thighs?|breasts?|steak|ground|roast|brisket|ribs?)\b/i, 'meat'],
  [/\b(?:shrimp|salmon|fish|tuna|tilapia|cod|crab|catfish)\b/i, 'seafood'],
  [/\b(?:onions?|peppers?|lettuce|tomato(?:es)?|potato(?:es)?|carrots?|celery|apples?|bananas?|limes?|lemons?|garlic|broccoli|spinach|avocados?|cilantro|berries|grapes?|oranges?|cucumbers?|squash|zucchini|mushrooms?|cabbage|corn)\b/i, 'produce'],
  [/\b(?:bread|tortillas?|buns?|bagels?|rolls?|loaf|muffins?)\b/i, 'bakery'],
  [/\b(?:coffee|tea|soda|juice|water|beer|wine|cola|sparkling)\b/i, 'beverage'],
  [/\b(?:salt|pepper|cumin|paprika|oregano|seasoning|spices?|chili powder|cinnamon|thyme|basil)\b/i, 'spice'],
  [/\b(?:ketchup|mustard|mayo|mayonnaise|sauce|salsa|dressing|vinegar|soy|sriracha|relish)\b/i, 'condiment'],
]

/* ------------------------------------------------------------------------------------------------
   Public API
   ------------------------------------------------------------------------------------------------ */

/** Parse one utterance into intents plus plain summary rows. Never throws: anything odd becomes one unknown intent. */
export function parseUtterance(text: string, ctx: ParseContext): ParseResult {
  const asked = typeof text === 'string' ? text.trim() : ''
  if (!asked) return unknownResult('Say or type what changed, like "we\'re out of eggs".')
  const endsWithQuestion = /\?\s*$/.test(asked)
  let t = normalize(asked)
  const lower = t.toLowerCase()

  // Read-only intents first; they answer at once and never touch data.
  if (READ_ALOUD.test(lower)) return queryResult('low', ctx)
  if (EXPIRING.test(lower)) return queryResult('expiring', ctx)
  if (SUGGEST_ASK.test(lower) && SUGGEST_TOPIC.test(lower)) return suggestResult(lower)
  if (endsWithQuestion || QUESTION_LEAD.test(lower)) return queryFromQuestion(t, ctx)

  // Writes: pull the store and the "to the list" phrase out, then read the rest clause by clause.
  const retailer = takeRetailer(t, ctx.retailers)
  t = retailer.rest
  const list = takeListPhrase(t)
  t = list.rest
  const listMode = list.found || retailer.retailer !== null || LIST_LEAD.test(t)
  const rows = classifyClauses(splitClauses(t, ctx), listMode, ctx)
  if (rows.length === 0) return unknownResult(clarifyFor(t, ctx))
  const changes = rows.map((r, i) => resolveRow(r, i, ctx, retailer.retailer))
  return { intents: groupIntents(changes, ctx), summary: changes.map((c) => describeChange(c, ctx)), changes }
}

/** The plain row for one change, after any fix the person made. */
export function describeChange(c: Change, ctx: ParseContext): string {
  const item = itemOf(c.itemId, ctx)
  const name = item?.name ?? capitalize(c.name)
  const q = resolveQuantity(c, item)
  switch (c.kind) {
    case 'set_status':
      return `${name}: ${STATUS_WORD[c.status ?? 'out']}${item ? '' : ' (new item)'}`
    case 'add': {
      const where = c.location ? capitalize(c.location) : locationName(item?.locationId ?? null, ctx)
      const notes = [where, item ? null : 'new item'].filter((s): s is string => !!s)
      const body = q ? formatQuantity(q) : item ? (item.trackMode === 'count' ? `1 more ${item.unit ?? ''}`.trim() : 'OK') : 'added'
      return `${name}: ${body}${notes.length ? ` (${notes.join(', ')})` : ''}`
    }
    case 'consume': {
      if (!item) return `${name}: not in the pantry`
      if (item.trackMode !== 'count') return `${name}: Low (used some)`
      return `${name}: used ${q ? formatQuantity(q) : `1 ${item.unit ?? ''}`.trim()}`
    }
    case 'list_add': {
      const bits = [q ? formatQuantity(q) : null, c.retailerName ?? null].filter((s): s is string => !!s)
      return `${name}: to the list${bits.length ? ` (${bits.join(', ')})` : ''}`
    }
  }
}

/** A second, quieter line for a change row: what applying it does to the count or the status. Null when nothing to add. */
export function changeDetail(c: Change, ctx: ParseContext): string | null {
  const item = itemOf(c.itemId, ctx)
  const q = resolveQuantity(c, item)
  if (c.kind === 'add') {
    if (!item) return `New ${CATEGORY_LABEL[c.category ?? 'pantry'].toLowerCase()} item${c.location ? ` in the ${c.location}` : ''}.`
    if (item.trackMode === 'count') {
      const have = item.qty ?? 0
      const delta = q?.amount ?? 1
      return `Now ${formatQuantity({ amount: have, unit: item.unit })}. After: ${formatQuantity({ amount: have + delta, unit: item.unit })}.`
    }
    return deriveStatus(item) === 'ok' ? 'Already OK.' : 'Marks it OK.'
  }
  if (c.kind === 'set_status') {
    if (!item) return `Not in the pantry yet. Apply adds it as ${STATUS_WORD[c.status ?? 'out']}.`
    if (item.trackMode === 'count' && c.status === 'out') return 'Sets the count to 0.'
    return deriveStatus(item) === c.status ? `Already ${STATUS_WORD[c.status ?? 'out']}.` : null
  }
  if (c.kind === 'consume') {
    if (!item) return 'Nothing to change. Tap Fix to pick the item.'
    if (item.trackMode !== 'count') return 'Tracked as OK, Low, Out, so this marks it Low.'
    const have = item.qty ?? 0
    const delta = q?.amount ?? 1
    return `Now ${formatQuantity({ amount: have, unit: item.unit })}. After: ${formatQuantity({ amount: Math.max(0, have - delta), unit: item.unit })}.`
  }
  return null
}

/** The amount to apply, in the item's unit when the item counts and the units agree or convert.
    "12-pack" of an item counted in rolls is 12 rolls. Null when nothing was said. */
export function resolveQuantity(c: Pick<Change, 'qty' | 'unit'>, item: Item | null): Quantity | null {
  if (c.qty === undefined || !Number.isFinite(c.qty)) return null
  const spoken: Quantity = { amount: c.qty, unit: normalizeUnit(c.unit ?? null) }
  if (!item || item.trackMode !== 'count') return spoken
  const target = normalizeUnit(item.unit)
  if (target === null) return spoken
  if (spoken.unit === null || spoken.unit === target || spoken.unit === 'pack') return { amount: c.qty, unit: target }
  const converted = safe(() => convert(spoken, target), null)
  if (converted) return { amount: Math.round(converted.amount * 1000) / 1000, unit: converted.unit }
  return { amount: c.qty, unit: target }
}

/** Best guess at a category for a new item from its words and unit. */
export function guessCategory(name: string, unit?: string | null): ItemCategory {
  for (const [re, cat] of CATEGORY_HINTS) if (re.test(name)) return cat
  const u = normalizeUnit(unit ?? null)
  if (u === 'roll') return 'paper'
  return 'pantry'
}

/** Items that are Low or Out, Out first, for "read my pantry". */
export function lowOutItems(items: Item[]): Item[] {
  const rank: Record<StockStatus, number> = { out: 0, low: 1, ok: 2 }
  return items
    .filter((i) => !i.deletedAt && deriveStatus(i) !== 'ok')
    .sort((a, b) => rank[deriveStatus(a)] - rank[deriveStatus(b)] || a.name.localeCompare(b.name))
}

/** One spoken sentence for the Low/Out items. */
export function speakLowOut(items: Item[]): string {
  const rows = lowOutItems(items)
  if (rows.length === 0) return 'Nothing is low or out.'
  const out = rows.filter((i) => deriveStatus(i) === 'out').map((i) => i.name)
  const low = rows.filter((i) => deriveStatus(i) === 'low').map((i) => i.name)
  const parts: string[] = []
  if (out.length) parts.push(`Out: ${out.join(', ')}.`)
  if (low.length) parts.push(`Low: ${low.join(', ')}.`)
  return parts.join(' ')
}

export function capitalize(s: string): string {
  const t = s.trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t
}

/* ------------------------------------------------------------------------------------------------
   Read-only intents
   ------------------------------------------------------------------------------------------------ */

type QueryKind = 'expiring' | 'low' | 'all' | 'items' | 'location'

function queryResult(kind: QueryKind, ctx: ParseContext, names: string[] = [], locationWord = ''): ParseResult {
  const live = ctx.items.filter((i) => !i.deletedAt)
  let summary: string[] = []
  let confidence: number = CONFIDENCE.exact
  let query = kind
  let itemNames: string[] | undefined

  if (kind === 'expiring') {
    if (!ctx.today) summary = ['Open the pantry to see use-by dates.']
    else {
      const rows = live
        .map((i) => ({ i, h: expiryHorizon(i, ctx.today!) }))
        .filter((x) => x.h !== null)
        .sort((a, b) => (a.i.useBy ?? '').localeCompare(b.i.useBy ?? ''))
      summary = rows.length ? rows.map((x) => `${x.i.name}: ${EXPIRY_LABEL[x.h!]}`) : ['Nothing is expiring this week.']
    }
  } else if (kind === 'low') {
    const rows = lowOutItems(live)
    summary = rows.length ? rows.map((i) => `${i.name}: ${STATUS_WORD[deriveStatus(i)]}`) : ['Nothing is Low or Out.']
  } else if (kind === 'location') {
    const locs = (ctx.locations ?? []).filter((l) => !l.deletedAt && (l.name.toLowerCase() === locationWord || l.kind === locationWord))
    const ids = new Set(locs.map((l) => l.id))
    const rows = live.filter((i) => i.locationId && ids.has(i.locationId)).sort((a, b) => a.name.localeCompare(b.name))
    summary = rows.length ? rows.map((i) => describeItem(i, ctx)) : [`Nothing is filed under ${capitalize(locationWord)}.`]
    query = 'location'
    itemNames = undefined
  } else if (kind === 'items') {
    itemNames = names
    const confidences: number[] = []
    for (const n of names) {
      const found = findAllByName(n, ctx)
      confidences.push(found.confidence)
      if (found.items.length === 0) summary.push(`${capitalize(n)}: not in the pantry`)
      else for (const i of found.items) summary.push(describeItem(i, ctx))
    }
    confidence = confidences.length ? Math.min(...confidences) : CONFIDENCE.exact
    query = 'items'
  } else {
    const lowOut = lowOutItems(live).length
    summary = [`${live.length} ${live.length === 1 ? 'item' : 'items'} in the pantry.`, lowOut ? `${lowOut} Low or Out.` : 'Nothing is Low or Out.']
  }

  const intent: Intent = itemNames ? { kind: 'inventory.query', confidence, query, itemNames } : { kind: 'inventory.query', confidence, query }
  return { intents: [intent], summary, changes: [] }
}

const QUERY_LEADS: RegExp[] = [
  /^(?:can you\s+|could you\s+)?(?:tell me|check|see|look|show me)\s+(?:if|whether|how much|how many|what)?\s*/i,
  /^(?:do|does|did|have|has|is|are|was|were)\s+(?:we|i|you|there|they)\s+(?:still\s+)?(?:have|got|have got|need|keep)?\s*/i,
  /^how\s+(?:much|many)\s+(?:of\s+)?/i,
  /^(?:what|which)(?:'s|\s+is|\s+are|\s+do\s+we\s+have|\s+do\s+i\s+have|\s+have\s+we\s+got|\s+about)?\s*/i,
  /^where(?:'s|\s+is|\s+are)?\s+(?:the\s+)?/i,
  /^(?:any|some|the|our|my|more|of|still|got any|got)\s+/i,
]
const QUERY_TAILS: RegExp[] = [
  /\s+(?:do we have|do i have|have we got|we have|we got|is there|are there|in stock|on hand|at home|in the house|around|left over|leftover)\s*$/i,
  /\s+(?:is|are)?\s*(?:still\s+)?(?:left|remaining)\s*$/i,
  /\s+(?:in|into)\s+(?:the\s+)?(?:pantry|fridge|freezer|house|kitchen)\s*$/i,
  /\s+(?:still|anymore|yet)\s*$/i,
]
const LOW_QUESTION = /^(?:(?:are|am|is|do|does)\s+)?(?:(?:we|i|you)\s+)?(?:(?:are|am|'re|do we|should we)\s+)?(?:all\s+)?(?:low|out|short|missing|running low|need|needed|needs|needing|to buy|to get)(?:\s+(?:of|on))?$/i
const LOCATION_QUESTION = /^(?:in|inside)\s+(?:the\s+|our\s+|my\s+)?([a-z][a-z ]*?)\s*$/i

function queryFromQuestion(t: string, ctx: ParseContext): ParseResult {
  let rest = t
  for (let pass = 0; pass < 4; pass += 1) {
    const before = rest
    for (const re of QUERY_LEADS) rest = rest.replace(re, '')
    if (rest === before) break
  }
  for (let pass = 0; pass < 4; pass += 1) {
    const before = rest
    for (const re of QUERY_TAILS) rest = rest.replace(re, '')
    if (rest === before) break
  }
  rest = rest.trim().replace(/^[\s,;:-]+|[\s,;:.!?-]+$/g, '')
  if (!rest || LOW_QUESTION.test(rest)) return LOW_QUESTION.test(rest) ? queryResult('low', ctx) : queryResult('all', ctx)
  const loc = LOCATION_QUESTION.exec(rest)
  if (loc) {
    const word = (loc[1] ?? '').toLowerCase()
    const mapped = LOCATION_WORDS.find(([re]) => re.test(word))?.[1] ?? word
    return queryResult('location', ctx, [], mapped)
  }
  const names = rest
    .split(/\s*(?:,|;|\band\b|\bor\b|&)\s*/i)
    .map((n) => cleanName(n))
    .filter((n) => n.length > 0)
  if (names.length === 0) return queryResult('all', ctx)
  return queryResult('items', ctx, names)
}

function suggestResult(lower: string): ParseResult {
  const filters: SuggestionFilters = {}
  if (/\b(?:tonight|dinner|supper|evening)\b/.test(lower)) filters.mealType = 'dinner'
  else if (/\blunch\b/.test(lower)) filters.mealType = 'lunch'
  else if (/\bbreakfast\b/.test(lower)) filters.mealType = 'breakfast'
  if (/\b(?:seated|sitting|sit down|sit-down|from a chair)\b/.test(lower)) filters.seatedFriendly = true
  if (/\b(?:cheap|cheapest|budget|inexpensive)\b/.test(lower)) filters.cheapest = true
  if (/\b(?:quick|fast|easy|simple|20 minutes?|half an hour)\b/.test(lower)) filters.maxActiveMinutes = 20
  if (/\b(?:crock ?pot|slow cooker)\b/.test(lower)) filters.equipment = ['crockpot']
  if (/\bfreez\w*\b/.test(lower)) filters.freezerSafe = true
  if (/\bone pot\b/.test(lower)) filters.tags = ['one_pot']
  const intent: Intent = Object.keys(filters).length ? { kind: 'recipe.suggest', confidence: CONFIDENCE.exact, filters } : { kind: 'recipe.suggest', confidence: CONFIDENCE.exact }
  return { intents: [intent], summary: ["Let's see what you can cook."], changes: [] }
}

function unknownResult(clarify: string): ParseResult {
  return { intents: [{ kind: 'unknown', confidence: CONFIDENCE.unknown, clarify }], summary: [clarify], changes: [] }
}

/** One clarifying question, never two. A bare item name gets the three things it could mean. */
function clarifyFor(t: string, ctx: ParseContext): string {
  const name = cleanName(t)
  if (name) {
    const m = safe(() => findItemByName(name, matchCtx(ctx)), null)
    const item = m?.itemId ? itemOf(m.itemId, ctx) : null
    if (item) return `Did we get ${item.name}, run out of it, or should it go on the list?`
  }
  return 'I did not catch that. Try "we\'re out of eggs" or "add Dawn to the list".'
}

/* ------------------------------------------------------------------------------------------------
   Write intents: strip store and list phrases, split into clauses, classify each one
   ------------------------------------------------------------------------------------------------ */

interface Row {
  kind: ChangeKind
  name: string
  qty?: number
  unit?: string
  status?: StockStatus
  location?: string
}

function normalize(text: string): string {
  let t = text.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim()
  t = t.replace(GREETING, '').replace(PLEASE, '').trim()
  return t.replace(/[\s.!?]+$/, '').trim()
}

function takeRetailer(text: string, retailers: Retailer[]): { retailer: Retailer | null; rest: string } {
  const candidates: { r: Retailer; alias: string }[] = []
  for (const r of retailers) {
    if (r.deletedAt) continue
    const aliases = new Set<string>([r.name.trim().toLowerCase(), ...(RETAILER_WORDS[r.kind] ?? [])])
    for (const a of aliases) if (a.length >= 3) candidates.push({ r, alias: a })
  }
  candidates.sort((a, b) => b.alias.length - a.alias.length)
  for (const { r, alias } of candidates) {
    const re = new RegExp(
      `(?:^|[\\s,;])(?:and\\s+)?(?:(?:send|ship|order|route|get|buy)\\s+(?:it|them|that|those|this|these|the rest)?\\s*)?(?:to|from|at|on|via|through|over to)?\\s*(?:the\\s+)?${escapeRe(alias)}(?=$|[\\s,;.!?])`,
      'i',
    )
    const m = re.exec(text)
    if (m) {
      const rest = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim()
      return { retailer: r, rest }
    }
  }
  return { retailer: null, rest: text }
}

function takeListPhrase(text: string): { found: boolean; rest: string } {
  for (const re of LIST_PHRASES) {
    const m = re.exec(text)
    if (m) {
      const rest = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim()
      return { found: true, rest }
    }
  }
  return { found: false, rest: text }
}

/** Split on commas and "and", but keep "half and half" and any pantry item whose name has "and" in it whole. */
function splitClauses(text: string, ctx: ParseContext): string[] {
  const protect = new Set<string>(PROTECTED_PAIRS)
  for (const i of ctx.items) {
    if (i.deletedAt) continue
    for (const n of [i.name.toLowerCase(), i.canonicalName]) if (/\band\b|&/.test(n)) protect.add(n)
  }
  let t = text
  for (const phrase of protect) {
    const re = new RegExp(`\\b${escapeRe(phrase).replace(/\\?&/g, '(?:&|and)').replace(/ /g, '\\s+')}\\b`, 'gi')
    t = t.replace(re, (m) => m.replace(/\s+(?:and|&)\s+/gi, JOIN_MARK))
  }
  return t
    .split(/\s*(?:,|;|\band\b|\bplus\b|\balso\b|&)\s*/i)
    .map((p) => p.split(JOIN_MARK).join(' and ').trim())
    .filter((p) => p.length > 0)
}

function classifyClauses(clauses: string[], listMode: boolean, ctx: ParseContext): Row[] {
  const rows: Row[] = []
  let prev: { kind: ChangeKind; status?: StockStatus } | null = null
  for (const clause of clauses) {
    const row = classifyClause(clause, listMode, prev, ctx)
    if (!row) continue
    rows.push(row)
    prev = { kind: row.kind, status: row.status }
  }
  return rows
}

function classifyClause(clause: string, listMode: boolean, prev: { kind: ChangeKind; status?: StockStatus } | null, ctx: ParseContext): Row | null {
  const c = clause.trim()
  if (!c) return null

  // "used a can of tomatoes", "used the last of the milk", "finished the bread"
  const consume = CONSUME_LEAD.exec(c)
  if (consume) {
    const verb = (consume[1] ?? '').toLowerCase()
    const rest = c.slice(consume[0].length)
    const lastOf = LAST_OF.exec(rest)
    if (lastOf || CONSUME_ALL.has(verb)) {
      const name = cleanName(lastOf ? rest.slice(lastOf[0].length) : rest)
      return name ? { kind: 'set_status', name, status: 'out' } : null
    }
    const q = amountAndName(rest, ctx)
    return q.name ? { kind: 'consume', name: q.name, qty: q.qty, unit: q.unit } : null
  }

  // "we're out of eggs", "low on butter", "eggs are out", "milk's gone"
  const st = takeStatus(c)
  if (st) return st.name ? { kind: 'set_status', name: st.name, status: st.status } : null

  // "add two cans of black beans", "we got 2 bags of rice"; in list mode "add" and "put" mean the list
  const add = ADD_LEAD.exec(c)
  if (add) {
    const q = amountAndName(c.slice(add[0].length), ctx)
    return q.name ? { kind: listMode ? 'list_add' : 'add', ...q } : null
  }

  // "we need eggs", "pick up milk"
  const lv = LIST_VERB.exec(c)
  if (lv) {
    const q = amountAndName(c.slice(lv[0].length), ctx)
    return q.name ? { kind: 'list_add', ...q } : null
  }

  // "... and a bottle of Dawn": the clause before said what to do with it
  if (prev) {
    if (prev.kind === 'set_status') {
      const name = cleanName(c)
      return name ? { kind: 'set_status', name, status: prev.status ?? 'out' } : null
    }
    const q = amountAndName(c, ctx)
    return q.name ? { kind: prev.kind, ...q } : null
  }

  // A bare "2 bags of rice" reads as stock that arrived; a bare name in list mode goes on the list.
  const q = amountAndName(c, ctx)
  if (!q.name) return null
  if (listMode) return { kind: 'list_add', ...q }
  if (q.qty !== undefined) return { kind: 'add', ...q }
  return null
}

function takeStatus(clause: string): { status: StockStatus; name: string } | null {
  for (const { re, status } of STATUS_MARKERS) {
    const m = re.exec(clause)
    if (!m) continue
    const name = cleanName(`${clause.slice(0, m.index)} ${clause.slice(m.index + m[0].length)}`.replace(STATUS_LEAD_FILLER, ''))
    return { status, name: name.replace(STATUS_LEAD_FILLER, '') }
  }
  return null
}

function amountAndName(text: string, ctx: ParseContext): { name: string; qty?: number; unit?: string; location?: string } {
  const loc = takeLocation(text, ctx)
  const s = loc.rest
  const q = safe(() => parseQuantity(s), null)
  // "half and half" parses as a number with nothing after it; then the whole thing is the name.
  if (q && cleanName(q.rest)) return { name: cleanName(q.rest), qty: q.amount, unit: q.unit ?? undefined, location: loc.location }
  return { name: cleanName(s), location: loc.location }
}

function takeLocation(text: string, ctx: ParseContext): { rest: string; location?: string } {
  const m = LOCATION_TAIL.exec(text)
  if (m) {
    const word = (m[1] ?? '').toLowerCase()
    const mapped = LOCATION_WORDS.find(([re]) => re.test(word))?.[1] ?? word
    return { rest: text.slice(0, m.index).trim(), location: mapped }
  }
  for (const l of ctx.locations ?? []) {
    if (l.deletedAt || !l.name.trim()) continue
    const re = new RegExp(`\\s*\\b(?:in|into|to|on|at|from)\\s+(?:the\\s+|our\\s+|my\\s+)?${escapeRe(l.name.trim())}\\s*$`, 'i')
    const lm = re.exec(text)
    if (lm) return { rest: text.slice(0, lm.index).trim(), location: l.name.toLowerCase() }
  }
  return { rest: text }
}

function cleanName(s: string): string {
  let n = s.replace(/\s+/g, ' ').trim()
  n = n.replace(NAME_LEAD_FILLER, '')
  n = n.replace(NAME_TAIL_FILLER, '')
  n = n.replace(/^[\s,;:-]+|[\s,;:.!?-]+$/g, '')
  return n
}

function resolveRow(row: Row, index: number, ctx: ParseContext, retailer: Retailer | null): Change {
  const m = safe(() => findItemByName(row.name, matchCtx(ctx)), { itemId: null, confidence: 0, via: 'none' as const })
  const itemId = m.itemId
  const item = itemOf(itemId, ctx)
  const confidence = itemId ? (m.via === 'fuzzy' ? CONFIDENCE.fuzzy : CONFIDENCE.exact) : CONFIDENCE.unknown
  const change: Change = {
    key: `${row.kind}-${index}`,
    kind: row.kind,
    name: row.name,
    itemId,
    confidence,
    qty: row.qty,
    unit: normalizeUnit(row.unit ?? null) ?? undefined,
    status: row.status,
    location: row.location,
    category: item?.category ?? guessCategory(row.name, row.unit),
  }
  if (row.kind === 'list_add') {
    change.retailerId = retailer?.id ?? null
    if (retailer) change.retailerName = retailer.name
  }
  return change
}

/** One intent per kind, items in the order they were said. */
function groupIntents(changes: Change[], ctx: ParseContext): Intent[] {
  const order: ChangeKind[] = []
  const byKind = new Map<ChangeKind, Change[]>()
  for (const c of changes) {
    if (!byKind.has(c.kind)) {
      byKind.set(c.kind, [])
      order.push(c.kind)
    }
    byKind.get(c.kind)!.push(c)
  }
  const intents: Intent[] = []
  for (const kind of order) {
    const list = byKind.get(kind) ?? []
    const confidence = Math.min(...list.map((c) => c.confidence))
    const nameOf = (c: Change) => itemOf(c.itemId, ctx)?.name ?? c.name
    if (kind === 'add') {
      intents.push({ kind: 'inventory.add', confidence, items: list.map((c) => compact({ name: nameOf(c), qty: c.qty, unit: c.unit, location: c.location, category: c.category })) })
    } else if (kind === 'set_status') {
      intents.push({ kind: 'inventory.set_status', confidence, items: list.map((c) => ({ name: nameOf(c), status: c.status ?? 'out' })) })
    } else if (kind === 'consume') {
      intents.push({ kind: 'inventory.consume', confidence, items: list.map((c) => compact({ name: nameOf(c), qty: c.qty, unit: c.unit })) })
    } else {
      intents.push({ kind: 'list.add', confidence, items: list.map((c) => compact({ name: nameOf(c), qty: c.qty, unit: c.unit, retailer: c.retailerName })) })
    }
  }
  return intents
}

/* ------------------------------------------------------------------------------------------------
   Lookups and formatting
   ------------------------------------------------------------------------------------------------ */

function matchCtx(ctx: ParseContext): MatchContext {
  return { items: ctx.items, aliases: ctx.aliases, alwaysHave: ctx.alwaysHave }
}

function itemOf(id: string | null, ctx: ParseContext): Item | null {
  if (!id) return null
  return ctx.items.find((i) => i.id === id && !i.deletedAt) ?? null
}

function locationName(id: string | null, ctx: ParseContext): string | null {
  if (!id) return null
  return ctx.locations?.find((l) => l.id === id)?.name ?? null
}

/** Every item a name could mean, best first: for "do we have any chicken" both the thighs and the broth. */
function findAllByName(name: string, ctx: ParseContext): { items: Item[]; confidence: number } {
  const live = ctx.items.filter((i) => !i.deletedAt)
  const best = safe(() => findItemByName(name, matchCtx(ctx)), { itemId: null, confidence: 0, via: 'none' as const })
  const canon = canonicalName(name)
  const scored = live
    .map((i) => ({ i, s: canon ? nameSimilarity(canon, i.canonicalName || canonicalName(i.name)) : 0 }))
    .filter((x) => x.s >= FUZZY_THRESHOLD)
    .sort((a, b) => b.s - a.s)
  const items = scored.map((x) => x.i)
  if (best.itemId) {
    const idx = items.findIndex((i) => i.id === best.itemId)
    if (idx > 0) items.unshift(...items.splice(idx, 1))
    else if (idx < 0) {
      const b = live.find((i) => i.id === best.itemId)
      if (b) items.unshift(b)
    }
  }
  const confidence = best.itemId ? (best.via === 'fuzzy' ? CONFIDENCE.fuzzy : CONFIDENCE.exact) : items.length ? CONFIDENCE.fuzzy : CONFIDENCE.unknown
  return { items, confidence }
}

/** "Boneless skinless chicken thighs: 1 lb, Low (Freezer)" / "Milk: OK (Fridge), use by Oct 8". */
export function describeItem(item: Item, ctx: ParseContext): string {
  const status = deriveStatus(item)
  const parts: string[] = []
  if (item.trackMode === 'count' && item.qty !== null) parts.push(formatQuantity({ amount: item.qty, unit: item.unit }))
  if (item.trackMode !== 'count' || status !== 'ok') parts.push(STATUS_WORD[status])
  const loc = locationName(item.locationId, ctx)
  let s = `${item.name}: ${parts.join(', ')}`
  if (loc) s += ` (${loc})`
  if (item.useBy) s += `, use by ${formatDate(item.useBy)}`
  return s
}

function compact<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v
  return out as T
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}
