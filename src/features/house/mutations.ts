import type { ActivityEvent, Container, Household, Location, Person, Retailer, RoutingRule, Rule, TenantRow } from '@/domain/types'
import { newId } from '@/domain/ids'
import { deleteRow, insertRow, logEvent, replaceRow, type Actor, type Undoable } from '@/data/mutations'
import { nowIso, type Repository, type TableName } from '@/data/repository'

export function base(householdId: string, actor: Actor): TenantRow {
  const now = nowIso()
  return { id: newId(), householdId, createdAt: now, createdBy: actor.userId, updatedAt: now, updatedBy: actor.userId, deletedAt: null }
}

export const addRule = (repo: Repository, householdId: string, rule: Omit<Rule, keyof TenantRow>, actor: Actor, summary: string) =>
  insertRow(repo, 'rules', { ...base(householdId, actor), ...rule }, actor, summary)
export const updateRule = (repo: Repository, before: Rule, patch: Partial<Rule>, actor: Actor, summary: string) =>
  replaceRow(repo, 'rules', before, { ...before, ...patch, updatedAt: nowIso() }, actor, summary)
export const removeRule = (repo: Repository, rule: Rule, actor: Actor, summary: string) => deleteRow(repo, 'rules', rule, actor, summary)

export const addRetailer = (repo: Repository, householdId: string, r: Omit<Retailer, keyof TenantRow>, actor: Actor) =>
  insertRow(repo, 'retailers', { ...base(householdId, actor), ...r }, actor, `Added ${r.name}`)
export const updateRetailer = (repo: Repository, before: Retailer, patch: Partial<Retailer>, actor: Actor, summary?: string) =>
  replaceRow(repo, 'retailers', before, { ...before, ...patch, updatedAt: nowIso() }, actor, summary ?? `Updated ${before.name}`)
export const removeRetailer = (repo: Repository, r: Retailer, actor: Actor) => deleteRow(repo, 'retailers', r, actor, `Removed ${r.name}`)

export const addRoutingRule = (repo: Repository, householdId: string, r: Omit<RoutingRule, keyof TenantRow>, actor: Actor, summary: string) =>
  insertRow(repo, 'routing_rules', { ...base(householdId, actor), ...r }, actor, summary)
export const updateRoutingRule = (repo: Repository, before: RoutingRule, patch: Partial<RoutingRule>, actor: Actor, summary: string) =>
  replaceRow(repo, 'routing_rules', before, { ...before, ...patch, updatedAt: nowIso() }, actor, summary)
export const removeRoutingRule = (repo: Repository, r: RoutingRule, actor: Actor, summary: string) => deleteRow(repo, 'routing_rules', r, actor, summary)

export const addLocation = (repo: Repository, householdId: string, l: Omit<Location, keyof TenantRow>, actor: Actor) =>
  insertRow(repo, 'locations', { ...base(householdId, actor), ...l }, actor, `Added location ${l.name}`)
export const updateLocation = (repo: Repository, before: Location, patch: Partial<Location>, actor: Actor) =>
  replaceRow(repo, 'locations', before, { ...before, ...patch, updatedAt: nowIso() }, actor, `Renamed ${before.name}`)
export const removeLocation = (repo: Repository, l: Location, actor: Actor) => deleteRow(repo, 'locations', l, actor, `Removed location ${l.name}`)

export const addContainer = (repo: Repository, householdId: string, c: Omit<Container, keyof TenantRow>, actor: Actor) =>
  insertRow(repo, 'containers', { ...base(householdId, actor), ...c }, actor, `Added ${c.name}`)
export const updateContainer = (repo: Repository, before: Container, patch: Partial<Container>, actor: Actor) =>
  replaceRow(repo, 'containers', before, { ...before, ...patch, updatedAt: nowIso() }, actor, `Updated ${before.name}`)
export const removeContainer = (repo: Repository, c: Container, actor: Actor) => deleteRow(repo, 'containers', c, actor, `Removed ${c.name}`)

export const addPerson = (repo: Repository, householdId: string, p: Omit<Person, keyof TenantRow>, actor: Actor) =>
  insertRow(repo, 'persons', { ...base(householdId, actor), ...p }, actor, `Added ${p.name}`)
export const updatePerson = (repo: Repository, before: Person, patch: Partial<Person>, actor: Actor) =>
  replaceRow(repo, 'persons', before, { ...before, ...patch, updatedAt: nowIso() }, actor, `Updated ${before.name}`)
export const removePerson = (repo: Repository, p: Person, actor: Actor) => deleteRow(repo, 'persons', p, actor, `Removed ${p.name}`)

/** Reverse any activity event from its before/after snapshots. Works for every table that logs through mutations.ts. */
export async function undoEvent(repo: Repository, event: ActivityEvent, actor: Actor): Promise<boolean> {
  const table = event.entityType as TableName
  if (!event.entityId || event.undoneByEventId) return false
  const col = repo.table(table)
  try {
    if (event.action === 'insert') {
      await col.softDelete(event.entityId)
    } else if (event.before && typeof event.before === 'object') {
      await col.put(event.before as never)
    } else {
      return false
    }
  } catch {
    return false
  }
  const undo = await logEvent(repo, event.householdId, actor, { entityType: table, entityId: event.entityId, action: 'undo', summary: `Undid: ${event.summary}`, before: event.after, after: event.before, undoOfEventId: event.id })
  await repo.table('activity_events').patch(event.id, { undoneByEventId: undo.id })
  return true
}

export type { Undoable }

/** Households have no household_id column; log against their own id. */
export async function updateHousehold(repo: Repository, before: Household, patch: Partial<Household>, actor: Actor, summary: string): Promise<Undoable> {
  const after: Household = { ...before, ...patch, updatedAt: nowIso() }
  await repo.table('households').put(after)
  const event = await logEvent(repo, before.id, actor, { entityType: 'households', entityId: before.id, action: 'update', summary, before, after })
  return {
    event,
    undo: async () => {
      await repo.table('households').put(before)
      const undo = await logEvent(repo, before.id, actor, { entityType: 'households', entityId: before.id, action: 'undo', summary: `Undid: ${summary}`, before: after, after: before, undoOfEventId: event.id })
      await repo.table('activity_events').patch(event.id, { undoneByEventId: undo.id })
    },
  }
}
