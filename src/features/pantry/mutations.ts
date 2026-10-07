import type { FreezerBlock, Item, ItemAlias, ItemCategory, Receipt, Spend, TrackMode } from '@/domain/types'
import { newId } from '@/domain/ids'
import { canonicalName } from '@/domain/names'
import { applyDelta, defaultUseBy, deriveStatus } from '@/domain/status'
import { planReceiptSave, receiptSummary, type ReceiptMatch } from '@/domain/receipts'
import { deleteRow, insertRow, logEvent, replaceRow, type Actor, type Undoable } from '@/data/mutations'
import { nowIso, type Repository } from '@/data/repository'

export interface NewItemInput {
  householdId: string
  name: string
  category: ItemCategory
  locationId: string | null
  trackMode: TrackMode
  qty?: number | null
  unit?: string | null
  par?: number | null
  useBy?: string | null
  alwaysHave?: boolean
  personId?: string | null
  today: string
}

export function buildItem(input: NewItemInput, userId: string | null): Item {
  const now = nowIso()
  const item: Item = {
    id: newId(),
    householdId: input.householdId,
    createdAt: now,
    createdBy: userId,
    updatedAt: now,
    updatedBy: userId,
    deletedAt: null,
    name: input.name.trim(),
    canonicalName: canonicalName(input.name),
    category: input.category,
    locationId: input.locationId,
    trackMode: input.trackMode,
    status: 'ok',
    qty: input.trackMode === 'count' ? (input.qty ?? 0) : null,
    unit: input.trackMode === 'count' ? (input.unit ?? null) : null,
    par: input.trackMode === 'count' ? (input.par ?? null) : null,
    useBy: input.useBy ?? defaultUseBy({ category: input.category, defaultShelfLifeDays: null }, input.today),
    barcode: null,
    imagePath: null,
    alwaysHave: input.alwaysHave ?? false,
    autoList: true,
    personId: input.personId ?? null,
    defaultShelfLifeDays: null,
    notes: null,
    sortOrder: 0,
  }
  item.status = deriveStatus(item)
  return item
}

export async function addItem(repo: Repository, input: NewItemInput, actor: Actor): Promise<Undoable & { item: Item }> {
  const item = buildItem(input, actor.userId)
  const r = await insertRow(repo, 'items', item, actor, `Added ${item.name}`)
  return { ...r, item }
}

export async function updateItem(repo: Repository, before: Item, patch: Partial<Item>, actor: Actor, summary?: string): Promise<Undoable> {
  const after: Item = { ...before, ...patch, updatedAt: nowIso() }
  if (patch.name !== undefined) after.canonicalName = canonicalName(patch.name)
  if (after.trackMode === 'count') after.status = deriveStatus(after)
  return replaceRow(repo, 'items', before, after, actor, summary ?? `Updated ${before.name}`)
}

export async function removeItem(repo: Repository, item: Item, actor: Actor): Promise<Undoable> {
  return deleteRow(repo, 'items', item, actor, `Removed ${item.name}`)
}

export async function addAlias(repo: Repository, item: Item, alias: string, actor: Actor, source: ItemAlias['source'] = 'manual'): Promise<Undoable> {
  const now = nowIso()
  const row: ItemAlias = {
    id: newId(),
    householdId: item.householdId,
    createdAt: now,
    createdBy: actor.userId,
    updatedAt: now,
    updatedBy: actor.userId,
    deletedAt: null,
    itemId: item.id,
    alias: alias.trim(),
    source,
    retailerId: null,
  }
  return insertRow(repo, 'item_aliases', row, actor, `${item.name} also called "${row.alias}"`)
}

export async function updateBlock(repo: Repository, before: FreezerBlock, patch: Partial<FreezerBlock>, actor: Actor, summary?: string): Promise<Undoable> {
  const after: FreezerBlock = { ...before, ...patch, updatedAt: nowIso() }
  return replaceRow(repo, 'freezer_blocks', before, after, actor, summary ?? `Updated ${before.title}`)
}

export async function addBlock(repo: Repository, block: FreezerBlock, actor: Actor): Promise<Undoable> {
  return insertRow(repo, 'freezer_blocks', block, actor, `Froze ${block.countInitial} ${block.title}${block.portionLabel ? ` (${block.portionLabel})` : ''}`)
}

export async function removeBlock(repo: Repository, block: FreezerBlock, actor: Actor): Promise<Undoable> {
  return deleteRow(repo, 'freezer_blocks', block, actor, `Removed ${block.title} from the freezer`)
}

/* ---- Receipts: one Save writes the receipt, its lines, prices, a spend row and the restocks, with one undo ---- */

export interface SaveReceiptInput {
  householdId: string
  retailerId: string | null
  retailerName: string | null
  /** YYYY-MM-DD, from the receipt when read, else today from the caller. */
  purchasedOn: string
  totalCents: number | null
  storagePath: string | null
  lines: ReceiptMatch[]
  items: Item[]
  rawResult?: unknown
}

export async function saveReceipt(repo: Repository, input: SaveReceiptInput, actor: Actor): Promise<Undoable & { receipt: Receipt; pricesWritten: number }> {
  const now = nowIso()
  const receiptId = newId()
  const plan = planReceiptSave({ householdId: input.householdId, receiptId, retailerId: input.retailerId, purchasedOn: input.purchasedOn, totalCents: input.totalCents, lines: input.lines, items: input.items, newId, now, userId: actor.userId })
  const receipt: Receipt = {
    id: receiptId,
    householdId: input.householdId,
    createdAt: now,
    createdBy: actor.userId,
    updatedAt: now,
    updatedBy: actor.userId,
    deletedAt: null,
    retailerId: input.retailerId,
    uploadedBy: actor.userId,
    storagePath: input.storagePath,
    purchasedOn: input.purchasedOn,
    totalCents: plan.spendCents,
    status: 'reviewed',
    rawResult: input.rawResult ?? null,
    listSendId: null,
  }
  const spend: Spend | null =
    plan.spendCents > 0
      ? { id: newId(), householdId: input.householdId, createdAt: now, createdBy: actor.userId, updatedAt: now, updatedBy: actor.userId, deletedAt: null, retailerId: input.retailerId, amountCents: plan.spendCents, kind: 'actual', category: 'groceries', occurredOn: input.purchasedOn, listSendId: null, receiptId, note: `Receipt${input.retailerName ? ` from ${input.retailerName}` : ''}` }
      : null
  const beforeItems: Item[] = [...plan.restocks.map((r) => ({ ...r.item })), ...plan.markOk.map((i) => ({ ...i }))]
  const afterItems: Item[] = [
    ...plan.restocks.map((r) => ({ ...applyDelta(r.item, r.add), updatedAt: now, updatedBy: actor.userId })),
    ...plan.markOk.map((i) => ({ ...i, status: 'ok' as const, updatedAt: now, updatedBy: actor.userId })),
  ]

  await repo.table('receipts').put(receipt)
  if (plan.receiptLines.length) await repo.table('receipt_lines').putMany(plan.receiptLines)
  if (plan.prices.length) await repo.table('prices').putMany(plan.prices)
  if (spend) await repo.table('spend').put(spend)
  if (afterItems.length) await repo.table('items').putMany(afterItems)
  const summary = receiptSummary(plan, input.retailerName)
  const event = await logEvent(repo, input.householdId, { ...actor, source: actor.source ?? 'receipt' }, { entityType: 'receipts', entityId: receipt.id, action: 'insert', summary, after: receipt })
  return {
    receipt,
    pricesWritten: plan.prices.length,
    event,
    undo: async () => {
      if (beforeItems.length) await repo.table('items').putMany(beforeItems)
      if (spend) await repo.table('spend').remove(spend.id)
      for (const p of plan.prices) await repo.table('prices').remove(p.id)
      for (const l of plan.receiptLines) await repo.table('receipt_lines').remove(l.id)
      await repo.table('receipts').remove(receipt.id)
      const undo = await logEvent(repo, input.householdId, actor, { entityType: 'receipts', entityId: receipt.id, action: 'undo', summary: `Undid: ${summary}`, undoOfEventId: event.id })
      await repo.table('activity_events').patch(event.id, { undoneByEventId: undo.id })
    },
  }
}
