import type { Item, ListLine, ListSend, Price, Retailer, Spend, TenantRow } from '@/domain/types'
import { SPEND_CATEGORY_FOR_ITEM } from '@/domain/types'
import { newId } from '@/domain/ids'
import { today } from '@/domain/dates'
import { applyDelta } from '@/domain/status'
import { insertRow, logEvent, replaceRow, type Actor, type Undoable } from '@/data/mutations'
import { nowIso, type Repository } from '@/data/repository'

function base(householdId: string, actor: Actor): TenantRow {
  const now = nowIso()
  return { id: newId(), householdId, createdAt: now, createdBy: actor.userId, updatedAt: now, updatedBy: actor.userId, deletedAt: null }
}

export function buildLine(householdId: string, actor: Actor, input: { item?: Item | null; name: string; qty?: number | null; unit?: string | null; retailerId?: string | null; reasons?: ListLine['reasons']; position?: number }): ListLine {
  return {
    ...base(householdId, actor),
    itemId: input.item?.id ?? null,
    name: input.item?.name ?? input.name,
    qty: input.qty ?? null,
    unit: input.unit ?? input.item?.unit ?? null,
    reasons: input.reasons ?? [{ kind: 'manual' }],
    retailerId: input.retailerId ?? null,
    status: 'open',
    listSendId: null,
    searchTerm: null,
    priceCentsEst: null,
    note: null,
    position: input.position ?? 0,
  }
}

export const updateLine = (repo: Repository, before: ListLine, patch: Partial<ListLine>, actor: Actor, summary: string) =>
  replaceRow(repo, 'list_lines', before, { ...before, ...patch, updatedAt: nowIso() }, actor, summary)

/** Send a destination group: creates the list_send, marks lines ordered, logs the estimated spend. One tap, one undo. */
export async function sendGroup(repo: Repository, householdId: string, retailer: Retailer | null, lines: ListLine[], estimatedCents: number | null, externalUrl: string | null, actor: Actor): Promise<Undoable & { send: ListSend }> {
  const send: ListSend = {
    ...base(householdId, actor),
    retailerId: retailer?.id ?? null,
    sentBy: actor.userId,
    sentAt: nowIso(),
    status: 'ordered',
    estimatedTotalCents: estimatedCents,
    actualTotalCents: null,
    externalUrl,
    externalOrderRef: null,
    receivedAt: null,
    lineCount: lines.length,
  }
  const before = lines.map((l) => ({ ...l }))
  const after = lines.map((l) => ({ ...l, status: 'ordered' as const, listSendId: send.id, updatedAt: nowIso() }))
  await repo.table('list_sends').put(send)
  await repo.table('list_lines').putMany(after)
  let spend: Spend | null = null
  if (estimatedCents !== null && estimatedCents > 0) {
    spend = { ...base(householdId, actor), retailerId: retailer?.id ?? null, amountCents: estimatedCents, kind: 'estimated', category: 'groceries', occurredOn: today(), listSendId: send.id, receiptId: null, note: `Sent to ${retailer?.name ?? 'list'}` }
    await repo.table('spend').put(spend)
  }
  const summary = `Sent ${lines.length} ${lines.length === 1 ? 'item' : 'items'} to ${retailer?.name ?? 'the list'}`
  const event = await logEvent(repo, householdId, actor, { entityType: 'list_sends', entityId: send.id, action: 'send', summary, after: send })
  return {
    send,
    event,
    undo: async () => {
      await repo.table('list_lines').putMany(before)
      await repo.table('list_sends').remove(send.id)
      if (spend) await repo.table('spend').remove(spend.id)
      const undo = await logEvent(repo, householdId, actor, { entityType: 'list_sends', entityId: send.id, action: 'undo', summary: `Undid: ${summary}`, before: send, undoOfEventId: event.id })
      await repo.table('activity_events').patch(event.id, { undoneByEventId: undo.id })
    },
  }
}

/** Mark a send received: lines flip to received, stock goes up (count items add qty, status items go OK), actual spend logged if given. */
export async function receiveSend(repo: Repository, send: ListSend, lines: ListLine[], items: Item[], actualCents: number | null, actor: Actor): Promise<Undoable> {
  const now = nowIso()
  const beforeLines = lines.map((l) => ({ ...l }))
  const beforeItems: Item[] = []
  const afterItems: Item[] = []
  for (const l of lines) {
    const item = items.find((i) => i.id === l.itemId)
    if (!item) continue
    beforeItems.push({ ...item })
    if (item.trackMode === 'count') afterItems.push({ ...applyDelta(item, l.qty ?? 1), useBy: item.useBy, updatedAt: now })
    else afterItems.push({ ...item, status: 'ok', updatedAt: now })
  }
  await repo.table('list_lines').putMany(lines.map((l) => ({ ...l, status: 'received' as const, updatedAt: now })))
  if (afterItems.length) await repo.table('items').putMany(afterItems)
  const afterSend: ListSend = { ...send, status: 'received', receivedAt: now, actualTotalCents: actualCents ?? send.actualTotalCents, updatedAt: now }
  await repo.table('list_sends').put(afterSend)
  let spend: Spend | null = null
  if (actualCents !== null) {
    const cat = afterItems[0] ? SPEND_CATEGORY_FOR_ITEM[afterItems[0].category] : 'groceries'
    spend = { ...base(send.householdId, actor), retailerId: send.retailerId, amountCents: actualCents, kind: 'actual', category: cat, occurredOn: today(), listSendId: send.id, receiptId: null, note: 'Received' }
    await repo.table('spend').put(spend)
  }
  const summary = `Received ${lines.length} ${lines.length === 1 ? 'item' : 'items'}; stock updated`
  const event = await logEvent(repo, send.householdId, actor, { entityType: 'list_sends', entityId: send.id, action: 'receive', summary, before: send, after: afterSend })
  return {
    event,
    undo: async () => {
      await repo.table('list_lines').putMany(beforeLines)
      if (beforeItems.length) await repo.table('items').putMany(beforeItems)
      await repo.table('list_sends').put(send)
      if (spend) await repo.table('spend').remove(spend.id)
      const undo = await logEvent(repo, send.householdId, actor, { entityType: 'list_sends', entityId: send.id, action: 'undo', summary: `Undid: ${summary}`, undoOfEventId: event.id })
      await repo.table('activity_events').patch(event.id, { undoneByEventId: undo.id })
    },
  }
}

export const addPrice = (repo: Repository, householdId: string, p: Omit<Price, keyof TenantRow>, actor: Actor, itemName: string) =>
  insertRow(repo, 'prices', { ...base(householdId, actor), ...p }, actor, `${itemName}: price noted`)

export const addSpend = (repo: Repository, householdId: string, s: Omit<Spend, keyof TenantRow>, actor: Actor, summary: string) =>
  insertRow(repo, 'spend', { ...base(householdId, actor), ...s }, actor, summary)
