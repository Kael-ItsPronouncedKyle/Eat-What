import Dexie, { type Table } from 'dexie'
import type { TableMap, TableName } from '../repository'

/** A queued write waiting for the network (spec: offline write queue). */
export interface OutboxOp {
  id: string
  householdId: string | null
  table: TableName
  rowId: string
  kind: 'put' | 'patch' | 'softDelete' | 'remove'
  payload: unknown
  createdAt: string
  attempts: number
  lastError: string | null
}

/** IndexedDB mirror. One object store per table, indexed by household so lists are cheap. */
export class QmDatabase extends Dexie {
  households!: Table<TableMap['households'], string>
  memberships!: Table<TableMap['memberships'], string>
  profiles!: Table<TableMap['profiles'], string>
  persons!: Table<TableMap['persons'], string>
  rules!: Table<TableMap['rules'], string>
  locations!: Table<TableMap['locations'], string>
  containers!: Table<TableMap['containers'], string>
  items!: Table<TableMap['items'], string>
  item_aliases!: Table<TableMap['item_aliases'], string>
  item_retailer_links!: Table<TableMap['item_retailer_links'], string>
  recipes!: Table<TableMap['recipes'], string>
  recipe_ingredients!: Table<TableMap['recipe_ingredients'], string>
  cook_weeks!: Table<TableMap['cook_weeks'], string>
  batches!: Table<TableMap['batches'], string>
  freezer_blocks!: Table<TableMap['freezer_blocks'], string>
  plan_entries!: Table<TableMap['plan_entries'], string>
  cook_sessions!: Table<TableMap['cook_sessions'], string>
  retailers!: Table<TableMap['retailers'], string>
  routing_rules!: Table<TableMap['routing_rules'], string>
  list_lines!: Table<TableMap['list_lines'], string>
  list_sends!: Table<TableMap['list_sends'], string>
  receipts!: Table<TableMap['receipts'], string>
  receipt_lines!: Table<TableMap['receipt_lines'], string>
  prices!: Table<TableMap['prices'], string>
  spend!: Table<TableMap['spend'], string>
  partner_turns!: Table<TableMap['partner_turns'], string>
  activity_events!: Table<TableMap['activity_events'], string>
  invites!: Table<TableMap['invites'], string>
  notification_prefs!: Table<TableMap['notification_prefs'], string>
  meta!: Table<{ key: string; value: unknown }, string>
  outbox!: Table<OutboxOp, string>

  constructor(name = 'quartermaster') {
    super(name)
    this.version(1).stores({
      households: 'id',
      memberships: 'id, householdId, userId',
      profiles: 'userId',
      persons: 'id, householdId',
      rules: 'id, householdId',
      locations: 'id, householdId',
      containers: 'id, householdId',
      items: 'id, householdId, [householdId+canonicalName]',
      item_aliases: 'id, householdId, itemId',
      item_retailer_links: 'id, householdId, itemId',
      recipes: 'id, householdId',
      recipe_ingredients: 'id, householdId, recipeId',
      cook_weeks: 'id, householdId',
      batches: 'id, householdId, cookWeekId',
      freezer_blocks: 'id, householdId',
      plan_entries: 'id, householdId, [householdId+date]',
      cook_sessions: 'id, householdId',
      retailers: 'id, householdId',
      routing_rules: 'id, householdId',
      list_lines: 'id, householdId, status',
      list_sends: 'id, householdId',
      receipts: 'id, householdId',
      receipt_lines: 'id, householdId, receiptId',
      prices: 'id, householdId, itemId',
      spend: 'id, householdId, occurredOn',
      partner_turns: 'id, householdId',
      activity_events: 'id, householdId, createdAt',
      invites: 'id, householdId',
      notification_prefs: 'id, householdId, userId',
      meta: 'key',
    })
    this.version(2).stores({ outbox: 'id, householdId, createdAt' })
  }

  store<K extends TableName>(name: K): Table<TableMap[K], string> {
    return this.table(name) as Table<TableMap[K], string>
  }
}
