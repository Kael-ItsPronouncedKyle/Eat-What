/** Pure helpers shared by the price-check edge function and the app: the prompt the model gets, the strict shape it must
    answer in, and the validation that turns its answer into price rows. No I/O here, so the rules are unit-tested. */

export interface QuoteRequestItem {
  id: string
  name: string
  /** The unit the household prices this item by, e.g. "dozen", "lb", "gallon". */
  unit: string | null
}

export interface QuoteAnswer {
  itemId: string
  priceCents: number
  unit: string | null
  unitQty: number | null
  /** Where the number came from. Required: no source, no quote. */
  sourceUrl: string
  /** The model's own read of how sure it is. Anything under `MIN_CONFIDENCE` is dropped. */
  confidence: number
  observedOn: string | null
}

export const MIN_CONFIDENCE = 0.6
export const MAX_ITEMS_PER_CALL = 25
/** A quote may not be more than this many days old to count as this week's check. */
export const MAX_QUOTE_AGE_DAYS = 45
/** Guard against hallucinated outliers: a quote more than this many times the previous known price is dropped. */
export const MAX_JUMP_FACTOR = 4

export function splitBatches<T>(items: T[], size = MAX_ITEMS_PER_CALL): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function buildPrompt(input: { retailerName: string; zip: string; today: string; items: QuoteRequestItem[] }): string {
  const list = input.items.map((i) => `- id=${i.id} | ${i.name}${i.unit ? ` | priced per ${i.unit}` : ''}`).join('\n')
  return [
    `Find the current shelf price of each grocery or household item below at ${input.retailerName} for a shopper in US ZIP ${input.zip}. Today is ${input.today}.`,
    'Use the retailer\'s own site or app listing when you can find it; a recent weekly ad or a reputable price tracker is acceptable as a second choice. Prefer the store brand or the most common size.',
    'Rules:',
    '- Report only prices you actually found on a page. If you cannot find a price for an item, leave it out. Never estimate.',
    '- Give the price for the unit named after "priced per" when there is one (convert if the page shows a different pack size, and say the pack size in unitQty and unit).',
    '- confidence is 0 to 1: 1 means the page named this retailer and this ZIP or a store in that city; 0.6 means a national price for this retailer; below 0.6 means you are guessing, so leave it out.',
    '- Answer with one JSON object and nothing else, in this exact shape:',
    '{"quotes":[{"itemId":"...","priceCents":349,"unit":"dozen","unitQty":1,"sourceUrl":"https://...","confidence":0.8,"observedOn":"YYYY-MM-DD or null"}]}',
    '',
    'Items:',
    list,
  ].join('\n')
}

/** Pull the JSON object out of a model answer that may carry prose around it. */
export function extractJson(text: string): unknown | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

export interface ValidatedQuote {
  itemId: string
  priceCents: number
  unit: string | null
  unitQty: number | null
  sourceUrl: string
  confidence: number
  observedOn: string
}

/** Keep only answers that are well formed, confident, sourced, fresh, and not wildly off a known price. */
export function validateQuotes(
  raw: unknown,
  ctx: { items: QuoteRequestItem[]; today: string; previousCents?: Record<string, number> },
): { accepted: ValidatedQuote[]; rejected: { itemId: string | null; reason: string }[] } {
  const accepted: ValidatedQuote[] = []
  const rejected: { itemId: string | null; reason: string }[] = []
  const known = new Map(ctx.items.map((i) => [i.id, i]))
  const quotes = (raw as { quotes?: unknown })?.quotes
  if (!Array.isArray(quotes)) return { accepted, rejected: [{ itemId: null, reason: 'no quotes array' }] }
  const seen = new Set<string>()
  for (const q of quotes as Partial<QuoteAnswer>[]) {
    const itemId = typeof q?.itemId === 'string' ? q.itemId : null
    if (!itemId || !known.has(itemId)) {
      rejected.push({ itemId, reason: 'unknown item' })
      continue
    }
    if (seen.has(itemId)) {
      rejected.push({ itemId, reason: 'duplicate' })
      continue
    }
    const cents = typeof q.priceCents === 'number' && Number.isFinite(q.priceCents) ? Math.round(q.priceCents) : NaN
    if (!(cents > 0 && cents < 100_000)) {
      rejected.push({ itemId, reason: 'bad price' })
      continue
    }
    const confidence = typeof q.confidence === 'number' ? q.confidence : 0
    if (confidence < MIN_CONFIDENCE) {
      rejected.push({ itemId, reason: 'low confidence' })
      continue
    }
    const sourceUrl = typeof q.sourceUrl === 'string' && /^https?:\/\/\S+$/.test(q.sourceUrl) ? q.sourceUrl : null
    if (!sourceUrl) {
      rejected.push({ itemId, reason: 'no source' })
      continue
    }
    const observedOn = typeof q.observedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q.observedOn) ? q.observedOn : ctx.today
    if (daysBetween(observedOn, ctx.today) > MAX_QUOTE_AGE_DAYS || observedOn > ctx.today) {
      rejected.push({ itemId, reason: 'stale quote' })
      continue
    }
    const prev = ctx.previousCents?.[itemId]
    if (prev && (cents > prev * MAX_JUMP_FACTOR || cents < prev / MAX_JUMP_FACTOR)) {
      rejected.push({ itemId, reason: 'outlier' })
      continue
    }
    seen.add(itemId)
    accepted.push({
      itemId,
      priceCents: cents,
      unit: typeof q.unit === 'string' && q.unit.trim() ? q.unit.trim().toLowerCase() : (known.get(itemId)?.unit ?? null),
      unitQty: typeof q.unitQty === 'number' && q.unitQty > 0 ? q.unitQty : 1,
      sourceUrl,
      confidence,
      observedOn,
    })
  }
  return { accepted, rejected }
}

function daysBetween(a: string, b: string): number {
  const ms = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))
  return Math.round(ms / 86_400_000)
}
