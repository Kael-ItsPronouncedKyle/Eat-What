import type { FreezerBlock, Item, ItemAlias, ItemCategory, TrackMode } from '@/domain/types'
import { newId } from '@/domain/ids'
import { canonicalName } from '@/domain/names'
import { defaultUseBy, deriveStatus } from '@/domain/status'
import { deleteRow, insertRow, replaceRow, type Actor, type Undoable } from '@/data/mutations'
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
