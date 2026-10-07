import { describe, expect, it } from 'vitest'
import { seededRepo } from '@/test/render'
import { qualityUntil } from '@/domain/labels'
import type { Batch, FreezerBlock, Recipe, TenantRow } from '@/domain/types'
import type { Actor } from '@/data/mutations'
import { base, finishCook } from './mutations'

/** Denton's seed plus one raw pot-roast kit block with `count` kits left. */
async function setup(count: number) {
  const repo = await seededRepo()
  const session = await repo.session()
  const householdId = session.activeHouseholdId!
  const actor: Actor = { userId: session.userId }
  const recipe = (await repo.table('recipes').list(householdId)).find((r) => r.title === 'Pot roast dump kit')!
  const cooked = (await repo.table('freezer_blocks').list(householdId))[0]!
  const raw: FreezerBlock = {
    ...cooked,
    id: 'raw-kit-test',
    recipeId: recipe.id,
    batchId: null,
    title: recipe.title,
    portionLabel: 'gallon bag',
    portionMl: 3800,
    servingsPerBlock: 6,
    countRemaining: count,
    countInitial: 2,
    cookedOn: cooked.cookedOn,
    qualityUntil: qualityUntil(cooked.cookedOn!, 'raw_marinated', null),
    foodType: 'raw_marinated',
  }
  await repo.table('freezer_blocks').put(raw)
  return { repo, householdId, actor, recipe, raw }
}

const cookOne = (recipe: Recipe, raw: FreezerBlock) => ({ recipe, session: null, planEntry: null, batch: null, servingsMade: 6, deductions: [], items: [], blocks: [], fromBlock: raw })

describe('finishCook from a raw block (Cook 1)', () => {
  it('takes one kit off the block, logs a cook session, writes no new blocks, and undo puts the kit back', async () => {
    const { repo, householdId, actor, recipe, raw } = await setup(2)
    const blocksBefore = (await repo.table('freezer_blocks').list(householdId)).length

    const result = await finishCook(repo, householdId, cookOne(recipe, raw), actor)

    expect((await repo.table('freezer_blocks').get(raw.id))!.countRemaining).toBe(1)
    expect((await repo.table('freezer_blocks').list(householdId)).length).toBe(blocksBefore)
    expect(result.event.summary).toBe('Cooked Pot roast dump kit from the freezer; 1 kit left')
    const sessions = (await repo.table('cook_sessions').list(householdId)).filter((s) => s.recipeId === recipe.id)
    expect(sessions.some((s) => s.status === 'confirmed' && s.servingsMade === 6)).toBe(true)
    expect((await repo.table('recipes').get(recipe.id))!.timesCooked).toBe(recipe.timesCooked + 1)

    await result.undo()
    expect((await repo.table('freezer_blocks').get(raw.id))!.countRemaining).toBe(2)
    expect((await repo.table('recipes').get(recipe.id))!.timesCooked).toBe(recipe.timesCooked)
    expect((await repo.table('activity_events').get(result.event.id))!.undoneByEventId).not.toBeNull()
  })

  it('never goes below zero kits', async () => {
    const { repo, householdId, actor, recipe, raw } = await setup(0)
    const result = await finishCook(repo, householdId, cookOne(recipe, raw), actor)
    expect((await repo.table('freezer_blocks').get(raw.id))!.countRemaining).toBe(0)
    expect(result.event.summary).toContain('0 kits left')
    await result.undo()
    expect((await repo.table('freezer_blocks').get(raw.id))!.countRemaining).toBe(0)
  })
})

describe('finishCook for a dump-kit batch (bagging up)', () => {
  it('writes raw kits, marks the batch frozen, and says "Bagged up" in the activity feed', async () => {
    const { repo, householdId, actor, recipe, raw } = await setup(1)
    const batch: Batch = { ...base(householdId, actor), cookWeekId: null, recipeId: recipe.id, kind: 'dump_kit', multiplier: 2, containerPlan: [], cookPersonId: null, scheduledOn: null, status: 'planned', cookedAt: null, estimatedCostCents: null, notes: null }
    await repo.table('batches').put(batch)
    const { id: _id, householdId: _h, createdAt: _c, createdBy: _cb, updatedAt: _u, updatedBy: _ub, deletedAt: _d, ...kit } = raw
    const newKit: Omit<FreezerBlock, keyof TenantRow> = { ...kit, batchId: batch.id, countRemaining: 2, countInitial: 2 }

    const result = await finishCook(repo, householdId, { recipe, session: null, planEntry: null, batch, servingsMade: 12, deductions: [], items: [], blocks: [newKit], assembled: true }, actor)

    expect(result.event.summary).toBe('Bagged up Pot roast dump kit; 2 raw kits to the freezer')
    expect((await repo.table('batches').get(batch.id))!.status).toBe('frozen')
    const written = (await repo.table('freezer_blocks').list(householdId)).filter((b) => b.batchId === batch.id)
    expect(written).toHaveLength(1)
    expect(written[0]!.foodType).toBe('raw_marinated')
    // The raw block that already existed is untouched: nothing was cooked from it.
    expect((await repo.table('freezer_blocks').get(raw.id))!.countRemaining).toBe(1)

    await result.undo()
    expect((await repo.table('batches').get(batch.id))!.status).toBe('planned')
    expect((await repo.table('freezer_blocks').list(householdId)).filter((b) => b.batchId === batch.id)).toHaveLength(0)
  })

  it('marks the batch assembled when no kits were written', async () => {
    const { repo, householdId, actor, recipe } = await setup(1)
    const batch: Batch = { ...base(householdId, actor), cookWeekId: null, recipeId: recipe.id, kind: 'dump_kit', multiplier: 1, containerPlan: [], cookPersonId: null, scheduledOn: null, status: 'planned', cookedAt: null, estimatedCostCents: null, notes: null }
    await repo.table('batches').put(batch)
    await finishCook(repo, householdId, { recipe, session: null, planEntry: null, batch, servingsMade: 6, deductions: [], items: [], blocks: [], assembled: true }, actor)
    expect((await repo.table('batches').get(batch.id))!.status).toBe('assembled')
  })
})
