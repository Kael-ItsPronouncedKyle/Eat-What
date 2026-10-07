import { describe, it, expect, beforeEach } from 'vitest'
import { LocalRepository } from './LocalRepository'
import { QmDatabase } from './db'
import { ensureDemoSeed } from '../seed/demo'

let counter = 0

describe('LocalRepository', () => {
  let repo: LocalRepository
  beforeEach(() => {
    repo = new LocalRepository({ db: new QmDatabase(`test-${++counter}`) })
  })

  it('seeds Denton and College Station once', async () => {
    expect(await ensureDemoSeed(repo)).toBe(true)
    expect(await ensureDemoSeed(repo)).toBe(false)
    const s = await repo.session()
    expect(s.households.map((h) => h.household.name).sort()).toEqual(['College Station', 'Denton'])
    const denton = s.households.find((h) => h.household.name === 'Denton')!.household
    expect(s.activeHouseholdId).toBe(denton.id)
    const items = await repo.table('items').list(denton.id)
    expect(items.length).toBeGreaterThan(50)
    const recipes = await repo.table('recipes').list(denton.id)
    expect(recipes.length).toBeGreaterThan(10)
    const ingredients = await repo.table('recipe_ingredients').list(denton.id)
    expect(ingredients.every((i) => recipes.some((r) => r.id === i.recipeId))).toBe(true)
    const prices = await repo.table('prices').list(denton.id)
    expect(prices.every((p) => p.source === 'starter')).toBe(true)
    const cs = s.households.find((h) => h.household.name === 'College Station')!.household
    const csPrices = await repo.table('prices').list(cs.id)
    expect(csPrices.length).toBeGreaterThan(40)
    const csRetailers = await repo.table('retailers').list(cs.id)
    expect(csRetailers.find((r) => r.isPrimaryGrocery)?.kind).toBe('heb')
    expect(cs.zip).toBe('77840')
  })

  it('keeps households apart and supports patch, soft delete, and change events', async () => {
    await ensureDemoSeed(repo)
    const s = await repo.session()
    const [a, b] = s.households.map((h) => h.household.id)
    const aItems = await repo.table('items').list(a!)
    const bItems = await repo.table('items').list(b!)
    expect(aItems.some((i) => bItems.some((j) => j.id === i.id))).toBe(false)

    const events: string[] = []
    const off = repo.subscribe((e) => events.push(`${e.table}:${e.ids.length}`))
    const first = aItems[0]!
    const patched = await repo.table('items').patch(first.id, { status: 'out' })
    expect(patched?.status).toBe('out')
    expect((patched?.updatedAt ?? '') >= first.updatedAt).toBe(true)
    await repo.table('items').softDelete(first.id)
    expect((await repo.table('items').list(a!)).some((i) => i.id === first.id)).toBe(false)
    expect((await repo.table('items').list(a!, { includeDeleted: true })).some((i) => i.id === first.id)).toBe(true)
    off()
    expect(events).toEqual(['items:1', 'items:1'])
  })

  it('creates a household with defaults and switches to it', async () => {
    await ensureDemoSeed(repo)
    const h = await repo.createHousehold({ name: 'Lake house', kit: 'basic' })
    const s = await repo.session()
    expect(s.activeHouseholdId).toBe(h.id)
    expect((await repo.table('locations').list(h.id)).length).toBe(7)
    expect((await repo.table('containers').list(h.id)).length).toBe(3)
    const members = await repo.table('memberships').list(h.id)
    expect(members[0]?.role).toBe('owner')
    expect(members[0]?.personId).toBeTruthy()
  })

  it('invites and accepts into an existing household', async () => {
    await ensureDemoSeed(repo)
    const s = await repo.session()
    const hid = s.activeHouseholdId!
    const token = await repo.createInvite({ householdId: hid, kind: 'member', role: 'viewer' })
    const other = new LocalRepository({ db: repo.db, userId: 'guest' })
    const joined = await other.acceptInvite(token)
    expect(joined.id).toBe(hid)
    const s2 = await other.session()
    expect(s2.households[0]?.role).toBe('viewer')
  })
})
