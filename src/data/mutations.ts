/* Write helpers shared by every feature: each one changes rows, logs an activity event with before/after, and returns an undo.
   Spec: "Undo, not confirm" and "Every change with undo" in the activity feed. */
import type { ActivityEvent, ActivitySource, FreezerBlock, Item, ListLine, StockStatus } from '@/domain/types'
import { newId } from '@/domain/ids'
import { applyDelta, cycleStatus, deriveStatus } from '@/domain/status'
import { nowIso, type Repository, type TableName } from './repository'

export interface Undoable {
  event: ActivityEvent
  undo: () => Promise<void>
}

export interface Actor {
  userId: string
  source?: ActivitySource
}

export async function logEvent(
  repo: Repository,
  householdId: string,
  actor: Actor,
  e: { entityType: TableName | string; entityId: string | null; action: string; summary: string; before?: unknown; after?: unknown; partnerTurnId?: string | null; cookSessionId?: string | null; undoOfEventId?: string | null },
): Promise<ActivityEvent> {
  const event: ActivityEvent = {
    id: newId(),
    householdId,
    actorUserId: actor.userId,
    entityType: e.entityType,
    entityId: e.entityId,
    action: e.action,
    summary: e.summary,
    before: e.before ?? null,
    after: e.after ?? null,
    source: actor.source ?? 'tap',
    partnerTurnId: e.partnerTurnId ?? null,
    cookSessionId: e.cookSessionId ?? null,
    undoOfEventId: e.undoOfEventId ?? null,
    undoneByEventId: null,
    createdAt: nowIso(),
  }
  await repo.table('activity_events').put(event)
  return event
}

/** Generic row replace with event and undo. */
type RowLike = { id: string; householdId: string }

export async function replaceRow<K extends TableName, T extends RowLike>(
  repo: Repository,
  table: K,
  before: T,
  after: T,
  actor: Actor,
  summary: string,
  action = 'update',
): Promise<Undoable> {
  const col = repo.table(table)
  await col.put(after as never)
  const event = await logEvent(repo, after.householdId, actor, { entityType: table, entityId: after.id, action, summary, before, after })
  return {
    event,
    undo: async () => {
      await col.put(before as never)
      const undoEvent = await logEvent(repo, after.householdId, actor, { entityType: table, entityId: after.id, action: 'undo', summary: `Undid: ${summary}`, before: after, after: before, undoOfEventId: event.id })
      await repo.table('activity_events').patch(event.id, { undoneByEventId: undoEvent.id })
    },
  }
}

export async function insertRow<K extends TableName, T extends RowLike>(
  repo: Repository,
  table: K,
  row: T,
  actor: Actor,
  summary: string,
): Promise<Undoable> {
  const col = repo.table(table)
  await col.put(row as never)
  const event = await logEvent(repo, row.householdId, actor, { entityType: table, entityId: row.id, action: 'insert', summary, after: row })
  return {
    event,
    undo: async () => {
      // Soft delete so an offline mirror on another phone learns about it (spec: tombstones).
      await col.softDelete(row.id)
      const undoEvent = await logEvent(repo, row.householdId, actor, { entityType: table, entityId: row.id, action: 'undo', summary: `Undid: ${summary}`, before: row, undoOfEventId: event.id })
      await repo.table('activity_events').patch(event.id, { undoneByEventId: undoEvent.id })
    },
  }
}

export async function deleteRow<K extends TableName, T extends RowLike & { deletedAt?: string | null }>(
  repo: Repository,
  table: K,
  row: T,
  actor: Actor,
  summary: string,
): Promise<Undoable> {
  const col = repo.table(table)
  await col.softDelete(row.id)
  const event = await logEvent(repo, row.householdId, actor, { entityType: table, entityId: row.id, action: 'delete', summary, before: row })
  return {
    event,
    undo: async () => {
      await col.put({ ...row, deletedAt: null } as never)
      const undoEvent = await logEvent(repo, row.householdId, actor, { entityType: table, entityId: row.id, action: 'undo', summary: `Undid: ${summary}`, after: row, undoOfEventId: event.id })
      await repo.table('activity_events').patch(event.id, { undoneByEventId: undoEvent.id })
    },
  }
}

/* ---- Inventory ---- */

export const STATUS_WORD: Record<StockStatus, string> = { ok: 'OK', low: 'Low', out: 'Out' }

export async function setItemStatus(repo: Repository, item: Item, status: StockStatus, actor: Actor): Promise<Undoable> {
  const after: Item = { ...item, status, updatedAt: nowIso() }
  return replaceRow(repo, 'items', item, after, actor, `${item.name}: ${STATUS_WORD[status]}`, 'set_status')
}

export async function cycleItemStatus(repo: Repository, item: Item, actor: Actor): Promise<Undoable> {
  return setItemStatus(repo, item, cycleStatus(item.status), actor)
}

export async function adjustItemQty(repo: Repository, item: Item, delta: number, actor: Actor, reason?: string): Promise<Undoable> {
  const after = { ...applyDelta(item, delta), updatedAt: nowIso() }
  const verb = delta < 0 ? 'Used' : 'Added'
  const summary = `${verb} ${Math.abs(delta)} ${item.unit ?? ''} ${item.name}`.replace(/\s+/g, ' ').trim() + (reason ? ` (${reason})` : '')
  return replaceRow(repo, 'items', item, after, actor, summary, 'adjust_qty')
}

export async function setItemQty(repo: Repository, item: Item, qty: number, actor: Actor): Promise<Undoable> {
  const next: Item = { ...item, qty: Math.max(0, qty), updatedAt: nowIso() }
  next.status = deriveStatus(next)
  return replaceRow(repo, 'items', item, next, actor, `${item.name}: ${qty} ${item.unit ?? ''}`.trim(), 'set_qty')
}

/* ---- Freezer ---- */

export async function eatFreezerBlock(repo: Repository, block: FreezerBlock, actor: Actor, count = 1): Promise<Undoable> {
  const after: FreezerBlock = { ...block, countRemaining: Math.max(0, block.countRemaining - count), updatedAt: nowIso() }
  return replaceRow(repo, 'freezer_blocks', block, after, actor, `Ate ${count} ${block.title}${block.portionLabel ? ` (${block.portionLabel})` : ''}`, 'eat')
}

/* ---- Shopping list ---- */

export async function addListLine(repo: Repository, line: ListLine, actor: Actor): Promise<Undoable> {
  return insertRow(repo, 'list_lines', line, actor, `Added ${line.name} to the list`)
}

export async function dropListLine(repo: Repository, line: ListLine, actor: Actor): Promise<Undoable> {
  const after: ListLine = { ...line, status: 'dropped', updatedAt: nowIso() }
  return replaceRow(repo, 'list_lines', line, after, actor, `Removed ${line.name} from the list`, 'drop')
}
