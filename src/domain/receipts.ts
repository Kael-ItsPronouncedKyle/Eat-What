/* Receipt lines to pantry items: pure matching and the plan for what one Save writes.
   The scan screen gets lines back from the receipt-parse function (or typed by hand), matches each to an item by name
   with the same rules voice and list adds use (findItemByName: alias, exact, fuzzy above 0.8), lets the person fix the
   match, then turns the reviewed rows into price rows, one spend row and count restocks. Nothing here touches I/O. */
import type { Item, Price, ReceiptLine } from './types'
import { findItemByName, type MatchContext, type MatchVia } from './matching'

/** One line as the parser or the person typed it. Prices are integer cents or null when unreadable. */
export interface ParsedReceiptLine {
  name: string
  qty: number | null
  unitPriceCents: number | null
  totalCents: number | null
}

export interface ReceiptMatch extends ParsedReceiptLine {
  /** Stable key for the review list. */
  key: string
  itemId: string | null
  confidence: number
  via: MatchVia
  /** False once the person set the match by hand; the badge then hides. */
  auto: boolean
  /** Lines the person skipped stay in the receipt as 'ignored' but write nothing else. */
  ignored: boolean
}

/** Match every line to an item. Pure, deterministic, never throws on odd input. */
export function matchReceiptLines(lines: ParsedReceiptLine[], ctx: MatchContext): ReceiptMatch[] {
  return lines.map((l, i) => {
    const name = (l.name ?? '').trim()
    let itemId: string | null = null
    let confidence = 0
    let via: MatchVia = 'none'
    if (name) {
      try {
        const m = findItemByName(name, ctx)
        if (m.itemId) {
          itemId = m.itemId
          confidence = m.confidence
          via = m.via
        }
      } catch {
        /* keep as unmatched */
      }
    }
    return { ...l, name, key: `line-${i}`, itemId, confidence, via, auto: true, ignored: !name }
  })
}

/** The price a line proves for one unit: the unit price when printed, else total / qty, else the total for one. */
export function lineUnitCents(line: ParsedReceiptLine): number | null {
  if (line.unitPriceCents !== null && line.unitPriceCents >= 0) return Math.round(line.unitPriceCents)
  if (line.totalCents === null || line.totalCents < 0) return null
  const qty = line.qty && line.qty > 0 ? line.qty : 1
  return Math.round(line.totalCents / qty)
}

/** What the lines add up to, for a check against the printed total. */
export function sumLineTotals(lines: ParsedReceiptLine[]): number {
  return lines.reduce((n, l) => n + (l.totalCents ?? (l.unitPriceCents !== null ? Math.round(l.unitPriceCents * (l.qty ?? 1)) : 0)), 0)
}

export interface ReceiptPlanInput {
  householdId: string
  receiptId: string
  retailerId: string | null
  /** YYYY-MM-DD; the receipt date when read, else today from the caller. */
  purchasedOn: string
  /** The printed total when read; else the sum of the lines. */
  totalCents: number | null
  lines: ReceiptMatch[]
  items: Item[]
  newId: () => string
  now: string
  userId: string | null
}

export interface ReceiptPlan {
  receiptLines: ReceiptLine[]
  prices: Price[]
  /** Count-mode items that get their quantity topped up, with the amount to add. */
  restocks: { item: Item; add: number }[]
  /** Status-mode matched items that were Low or Out and go back to OK. */
  markOk: Item[]
  spendCents: number
  matched: number
  unmatched: number
}

/** Turn reviewed lines into the rows one Save writes. Prices come only from lines with a readable price (never guessed),
    one price per item per receipt (the first line wins). Restocks add the line qty (or 1) to count items. */
export function planReceiptSave(input: ReceiptPlanInput): ReceiptPlan {
  const base = () => ({ id: input.newId(), householdId: input.householdId, createdAt: input.now, createdBy: input.userId, updatedAt: input.now, updatedBy: input.userId, deletedAt: null })
  const receiptLines: ReceiptLine[] = []
  const prices: Price[] = []
  const restocks: ReceiptPlan['restocks'] = []
  const markOk: Item[] = []
  const priced = new Set<string>()
  const restocked = new Map<string, number>()
  let matched = 0
  let unmatched = 0
  for (const l of input.lines) {
    if (!l.name.trim()) continue
    const item = l.ignored ? null : l.itemId ? (input.items.find((i) => i.id === l.itemId && !i.deletedAt) ?? null) : null
    receiptLines.push({
      id: input.newId(),
      householdId: input.householdId,
      receiptId: input.receiptId,
      rawText: l.name,
      qty: l.qty,
      unitPriceCents: l.unitPriceCents,
      lineTotalCents: l.totalCents,
      itemId: item?.id ?? null,
      status: l.ignored ? 'ignored' : item ? 'matched' : 'unmatched',
    })
    if (l.ignored) continue
    if (!item) {
      unmatched += 1
      continue
    }
    matched += 1
    const unitCents = lineUnitCents(l)
    if (unitCents !== null && !priced.has(item.id)) {
      priced.add(item.id)
      prices.push({
        ...base(),
        itemId: item.id,
        retailerId: input.retailerId,
        priceCents: unitCents,
        unitQty: 1,
        unit: item.unit ?? null,
        source: 'receipt',
        observedOn: input.purchasedOn,
        receiptId: input.receiptId,
        note: l.name === item.name ? null : `Receipt line: ${l.name}`,
      })
    }
    if (item.trackMode === 'count') restocked.set(item.id, (restocked.get(item.id) ?? 0) + (l.qty && l.qty > 0 ? l.qty : 1))
    else if (item.status !== 'ok' && !markOk.some((i) => i.id === item.id)) markOk.push(item)
  }
  for (const [id, add] of restocked) {
    const item = input.items.find((i) => i.id === id)
    if (item) restocks.push({ item, add })
  }
  const spendCents = input.totalCents !== null && input.totalCents >= 0 ? Math.round(input.totalCents) : sumLineTotals(input.lines.filter((l) => !l.ignored))
  return { receiptLines, prices, restocks, markOk, spendCents, matched, unmatched }
}

/** Plain one-line summary for the undo bar and the activity feed. */
export function receiptSummary(plan: ReceiptPlan, retailerName: string | null): string {
  const bits = [`${plan.prices.length} ${plan.prices.length === 1 ? 'price' : 'prices'}`]
  const restocked = plan.restocks.length + plan.markOk.length
  if (restocked) bits.push(`${restocked} restocked`)
  if (plan.unmatched) bits.push(`${plan.unmatched} not matched`)
  return `Receipt${retailerName ? ` from ${retailerName}` : ''}: ${bits.join(', ')}`
}
