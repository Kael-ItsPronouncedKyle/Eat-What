/* Turns intents from the server parser (supabase/functions/parse-intent) into the same ParseResult the local parser
   returns, so the confirm sheet needs no change. Pure: matching uses the same domain rules as the local parser.
   Returns null for intents the sheet answers better locally (questions, suggestions, unknowns) or cannot apply yet
   (plan, routing, rules); the caller then falls back to the local parser. */
import type { Intent, ItemCategory } from '@/domain/types'
import { findItemByName } from '@/domain/matching'
import { CONFIDENCE, describeChange, guessCategory, type Change, type ParseContext, type ParseResult } from './intents'

const CATEGORIES = new Set<ItemCategory>(['produce', 'dairy', 'meat', 'seafood', 'pantry', 'frozen', 'bakery', 'beverage', 'spice', 'condiment', 'cleaning', 'paper', 'pet', 'pharmacy', 'personal', 'household', 'other'])

export type RemoteOutcome = { kind: 'changes'; result: ParseResult } | { kind: 'generate'; brief: string; intents: Intent[] } | { kind: 'fallback' }

/** Decide what to do with the server's intents. */
export function fromRemoteIntents(intents: Intent[], ctx: ParseContext): RemoteOutcome {
  const first = intents[0]
  if (!first) return { kind: 'fallback' }
  if (first.kind === 'recipe.generate') return { kind: 'generate', brief: first.brief, intents }
  const writes = intents.filter((i) => i.kind === 'inventory.add' || i.kind === 'inventory.set_status' || i.kind === 'inventory.consume' || i.kind === 'list.add')
  if (writes.length === 0 || writes.length !== intents.length) return { kind: 'fallback' }
  const changes: Change[] = []
  for (const intent of writes) changes.push(...changesFor(intent, ctx, changes.length))
  if (changes.length === 0) return { kind: 'fallback' }
  return { kind: 'changes', result: { intents, summary: changes.map((c) => describeChange(c, ctx)), changes } }
}

function changesFor(intent: Intent, ctx: ParseContext, offset: number): Change[] {
  const match = (name: string) => {
    try {
      const m = findItemByName(name, { items: ctx.items, aliases: ctx.aliases, alwaysHave: ctx.alwaysHave })
      if (!m.itemId) return { itemId: null, confidence: CONFIDENCE.unknown }
      return { itemId: m.itemId, confidence: m.via === 'fuzzy' ? CONFIDENCE.fuzzy : CONFIDENCE.exact }
    } catch {
      return { itemId: null, confidence: CONFIDENCE.unknown }
    }
  }
  const category = (name: string, given: string | undefined, unit: string | undefined, itemId: string | null): ItemCategory => {
    const item = itemId ? ctx.items.find((i) => i.id === itemId) : null
    if (item) return item.category
    if (given && CATEGORIES.has(given as ItemCategory)) return given as ItemCategory
    return guessCategory(name, unit)
  }
  const out: Change[] = []
  switch (intent.kind) {
    case 'inventory.add':
      for (const it of intent.items) {
        const m = match(it.name)
        out.push({ key: `r${offset + out.length}`, kind: 'add', name: it.name, ...m, qty: it.qty, unit: it.unit, location: it.location, category: category(it.name, it.category, it.unit, m.itemId) })
      }
      break
    case 'inventory.set_status':
      for (const it of intent.items) {
        const m = match(it.name)
        out.push({ key: `r${offset + out.length}`, kind: 'set_status', name: it.name, ...m, status: it.status, category: category(it.name, undefined, undefined, m.itemId) })
      }
      break
    case 'inventory.consume':
      for (const it of intent.items) out.push({ key: `r${offset + out.length}`, kind: 'consume', name: it.name, ...match(it.name), qty: it.qty, unit: it.unit })
      break
    case 'list.add':
      for (const it of intent.items) {
        const m = match(it.name)
        const retailer = it.retailer ? (ctx.retailers.find((r) => !r.deletedAt && (r.name.toLowerCase() === it.retailer!.toLowerCase() || r.kind === it.retailer!.toLowerCase())) ?? null) : null
        out.push({ key: `r${offset + out.length}`, kind: 'list_add', name: it.name, ...m, qty: it.qty, unit: it.unit, retailerId: retailer?.id ?? null, retailerName: retailer?.name, category: category(it.name, undefined, it.unit, m.itemId) })
      }
      break
    default:
      break
  }
  return out
}
