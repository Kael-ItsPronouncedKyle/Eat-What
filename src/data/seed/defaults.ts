import type { Container, Location, Person, TenantRow } from '@/domain/types'
import { newId } from '@/domain/ids'
import { nowIso, type Repository } from '../repository'

export type Kit = 'souper_cubes' | 'cheapest' | 'basic'

export function tenantBase(householdId: string, userId: string | null = null): TenantRow {
  const now = nowIso()
  return { id: newId(), householdId, createdAt: now, createdBy: userId, updatedAt: now, updatedBy: userId, deletedAt: null }
}

export function kitContainers(householdId: string, kit: Kit): Container[] {
  const c = (name: string, kind: Container['kind'], capacityMl: number, countOwned: number, disposable: boolean, ovenSafe: boolean, microwaveSafe: boolean, sortOrder: number): Container => ({
    ...tenantBase(householdId), name, kind, capacityMl, countOwned, disposable, ovenSafe, microwaveSafe, sortOrder,
  })
  if (kit === 'souper_cubes') {
    return [
      c('Souper Cubes 2-cup', 'tray', 480, 8, false, false, false, 0),
      c('Souper Cubes 1-cup', 'tray', 240, 8, false, false, false, 1),
      c('Souper Cubes 1/2-cup', 'tray', 120, 6, false, false, false, 2),
      c('Quart zip bag', 'bag', 950, 20, true, false, false, 3),
    ]
  }
  if (kit === 'cheapest') {
    return [
      c('Quart zip bag', 'bag', 950, 25, true, false, false, 0),
      c('Gallon zip bag', 'bag', 3800, 10, true, false, false, 1),
      c('Muffin tin cup', 'muffin_tin', 90, 12, false, true, false, 2),
      c('Saved tub', 'tub', 500, 6, false, false, true, 3),
    ]
  }
  return [
    c('Quart zip bag', 'bag', 950, 20, true, false, false, 0),
    c('Deli quart', 'tub', 950, 6, false, false, true, 1),
    c('Foil pan', 'pan', 2400, 4, true, true, false, 2),
  ]
}

export function defaultLocations(householdId: string): Location[] {
  const l = (name: string, kind: Location['kind'], sortOrder: number, parentId: string | null = null, isFreezerShelf = false): Location => ({
    ...tenantBase(householdId), name, kind, parentId, isFreezerShelf, sortOrder,
  })
  const freezer = l('Freezer', 'freezer', 2)
  return [
    l('Pantry', 'pantry', 0),
    l('Fridge', 'fridge', 1),
    freezer,
    l('Freezer shelf', 'freezer', 0, freezer.id, true),
    l('Cleaning closet', 'cleaning', 3),
    l('Bathroom', 'bathroom', 4),
    l('Garage', 'garage', 5),
  ]
}

/** Mirrors app.seed_household_defaults in SQL for the local adapter. */
export async function seedHouseholdDefaults(repo: Repository, householdId: string, opts: { kit: Kit; ownerUserId: string; ownerName: string }): Promise<void> {
  await repo.table('locations').putMany(defaultLocations(householdId))
  await repo.table('containers').putMany(kitContainers(householdId, opts.kit))
  const me: Person = { ...tenantBase(householdId, opts.ownerUserId), name: opts.ownerName, userId: opts.ownerUserId, plateProfile: {}, color: null, sortOrder: 0 }
  await repo.table('persons').put(me)
  const session = await repo.session()
  const membership = session.households.find((h) => h.household.id === householdId)?.membership
  if (membership) await repo.table('memberships').patch(membership.id, { personId: me.id })
}
