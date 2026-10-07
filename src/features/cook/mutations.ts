import type { Batch, CookSession, CookWeek, Deduction, FreezerBlock, Item, PlanEntry, Recipe, RecipeIngredient, RecipeWithIngredients, TenantRow } from '@/domain/types'
import { newId } from '@/domain/ids'
import { canonicalName } from '@/domain/names'
import { effortScore } from '@/domain/effort'
import { applyDelta } from '@/domain/status'
import { deleteRow, insertRow, logEvent, replaceRow, type Actor, type Undoable } from '@/data/mutations'
import { nowIso, type Repository } from '@/data/repository'

export function base(householdId: string, actor: Actor): TenantRow {
  const now = nowIso()
  return { id: newId(), householdId, createdAt: now, createdBy: actor.userId, updatedAt: now, updatedBy: actor.userId, deletedAt: null }
}

/* ---- Recipes ---- */

export interface RecipeDraftIngredient {
  ingredientName: string
  amount: number | null
  unit: string | null
  preparation?: string | null
  optional?: boolean
  substitute?: string | null
  itemId?: string | null
}

export async function saveRecipe(
  repo: Repository,
  householdId: string,
  draft: Omit<Recipe, keyof TenantRow | 'effortScore'> & { id?: string },
  ingredients: RecipeDraftIngredient[],
  actor: Actor,
  existing?: RecipeWithIngredients | null,
): Promise<Undoable & { recipe: Recipe }> {
  const now = nowIso()
  const recipe: Recipe = {
    ...(existing ?? base(householdId, actor)),
    ...draft,
    id: existing?.id ?? draft.id ?? newId(),
    householdId,
    updatedAt: now,
    updatedBy: actor.userId,
    effortScore: null,
  }
  try {
    recipe.effortScore = effortScore(recipe)
  } catch {
    recipe.effortScore = null
  }
  const rows: RecipeIngredient[] = ingredients
    .filter((i) => i.ingredientName.trim())
    .map((i, position) => ({
      ...base(householdId, actor),
      recipeId: recipe.id,
      position,
      ingredientName: i.ingredientName.trim(),
      canonicalName: canonicalName(i.ingredientName),
      amount: i.amount,
      unit: i.unit,
      preparation: i.preparation ?? null,
      optional: i.optional ?? false,
      groupLabel: null,
      substitute: i.substitute ?? null,
      itemId: i.itemId ?? null,
      matchConfidence: i.itemId ? 1 : null,
      fdcId: null,
      grams: null,
    }))
  const oldIngredients = existing?.ingredients ?? []
  await repo.table('recipes').put(recipe)
  for (const old of oldIngredients) await repo.table('recipe_ingredients').remove(old.id)
  await repo.table('recipe_ingredients').putMany(rows)
  const summary = existing ? `Updated recipe ${recipe.title}` : `Added recipe ${recipe.title}`
  const event = await logEvent(repo, householdId, actor, { entityType: 'recipes', entityId: recipe.id, action: existing ? 'update' : 'insert', summary, before: existing ?? null, after: recipe })
  return {
    recipe,
    event,
    undo: async () => {
      for (const r of rows) await repo.table('recipe_ingredients').remove(r.id)
      if (existing) {
        const { ingredients: _i, ...prev } = existing
        await repo.table('recipes').put(prev)
        await repo.table('recipe_ingredients').putMany(oldIngredients)
      } else {
        await repo.table('recipes').remove(recipe.id)
      }
      const undo = await logEvent(repo, householdId, actor, { entityType: 'recipes', entityId: recipe.id, action: 'undo', summary: `Undid: ${summary}`, undoOfEventId: event.id })
      await repo.table('activity_events').patch(event.id, { undoneByEventId: undo.id })
    },
  }
}

export const archiveRecipe = (repo: Repository, recipe: Recipe, actor: Actor) => deleteRow(repo, 'recipes', recipe, actor, `Removed recipe ${recipe.title}`)
export const approveRecipe = (repo: Repository, recipe: Recipe, actor: Actor) => replaceRow(repo, 'recipes', recipe, { ...recipe, status: 'approved', updatedAt: nowIso() }, actor, `Approved ${recipe.title}`)

/** Link an ingredient to a pantry item (the "fix" tap); remembered on the ingredient row. */
export const linkIngredient = (repo: Repository, ing: RecipeIngredient, itemId: string | null, actor: Actor, itemName: string) =>
  replaceRow(repo, 'recipe_ingredients', ing, { ...ing, itemId, matchConfidence: itemId ? 1 : null, updatedAt: nowIso() }, actor, itemId ? `${ing.ingredientName} now maps to ${itemName}` : `${ing.ingredientName} unlinked`)

/* ---- Plan ---- */

export function buildEntry(householdId: string, actor: Actor, e: Partial<PlanEntry> & { date: string; kind: PlanEntry['kind'] }): PlanEntry {
  return { ...base(householdId, actor), slot: 'dinner', recipeId: null, freezerBlockId: null, batchId: null, personId: null, note: null, servings: null, position: 0, status: 'planned', ...e }
}

export const addEntry = (repo: Repository, entry: PlanEntry, actor: Actor, summary: string) => insertRow(repo, 'plan_entries', entry, actor, summary)
export const updateEntry = (repo: Repository, before: PlanEntry, patch: Partial<PlanEntry>, actor: Actor, summary: string) =>
  replaceRow(repo, 'plan_entries', before, { ...before, ...patch, updatedAt: nowIso() }, actor, summary)
export const removeEntry = (repo: Repository, entry: PlanEntry, actor: Actor, summary: string) => deleteRow(repo, 'plan_entries', entry, actor, summary)

/* ---- Cook weeks and batches ---- */

export const addCookWeek = (repo: Repository, householdId: string, w: Omit<CookWeek, keyof TenantRow>, actor: Actor) =>
  insertRow(repo, 'cook_weeks', { ...base(householdId, actor), ...w }, actor, `Started a cook week`)
export const updateCookWeek = (repo: Repository, before: CookWeek, patch: Partial<CookWeek>, actor: Actor, summary: string) =>
  replaceRow(repo, 'cook_weeks', before, { ...before, ...patch, updatedAt: nowIso() }, actor, summary)
export const addBatch = (repo: Repository, householdId: string, b: Omit<Batch, keyof TenantRow>, actor: Actor, summary: string) =>
  insertRow(repo, 'batches', { ...base(householdId, actor), ...b }, actor, summary)
export const updateBatch = (repo: Repository, before: Batch, patch: Partial<Batch>, actor: Actor, summary: string) =>
  replaceRow(repo, 'batches', before, { ...before, ...patch, updatedAt: nowIso() }, actor, summary)
export const removeBatch = (repo: Repository, b: Batch, actor: Actor, summary: string) => deleteRow(repo, 'batches', b, actor, summary)

/* ---- Cook sessions: end of cook writes the freezer shelf and applies the confirmed deductions ---- */

export interface FinishCookInput {
  recipe: Recipe
  session: CookSession | null
  planEntry: PlanEntry | null
  batch: Batch | null
  servingsMade: number | null
  deductions: Deduction[]
  items: Item[]
  blocks: Omit<FreezerBlock, keyof TenantRow>[]
}

export async function finishCook(repo: Repository, householdId: string, input: FinishCookInput, actor: Actor): Promise<Undoable> {
  const now = nowIso()
  const beforeItems: Item[] = []
  const afterItems: Item[] = []
  for (const d of input.deductions) {
    if (d.action === 'skip' || !d.itemId) continue
    const item = input.items.find((i) => i.id === d.itemId)
    if (!item) continue
    beforeItems.push({ ...item })
    if (item.trackMode === 'count' && d.amount !== null) afterItems.push({ ...applyDelta(item, -d.amount), updatedAt: now })
    else if (d.newStatus) afterItems.push({ ...item, status: d.newStatus, updatedAt: now })
  }
  const blocks: FreezerBlock[] = input.blocks.map((b) => ({ ...base(householdId, actor), ...b }))
  const session: CookSession = input.session
    ? { ...input.session, finishedAt: now, servingsMade: input.servingsMade, deductions: input.deductions, status: 'confirmed', updatedAt: now }
    : { ...base(householdId, actor), recipeId: input.recipe.id, planEntryId: input.planEntry?.id ?? null, batchId: input.batch?.id ?? null, cookedBy: actor.userId, startedAt: now, finishedAt: now, servingsMade: input.servingsMade, deductions: input.deductions, status: 'confirmed' }
  const recipeBefore = input.recipe
  const recipeAfter: Recipe = { ...input.recipe, lastCookedAt: now, timesCooked: input.recipe.timesCooked + 1, updatedAt: now }
  const entryBefore = input.planEntry
  const batchBefore = input.batch
  if (afterItems.length) await repo.table('items').putMany(afterItems)
  if (blocks.length) await repo.table('freezer_blocks').putMany(blocks)
  await repo.table('cook_sessions').put(session)
  await repo.table('recipes').put(recipeAfter)
  if (entryBefore) await repo.table('plan_entries').put({ ...entryBefore, status: 'cooked', updatedAt: now })
  if (batchBefore) await repo.table('batches').put({ ...batchBefore, status: blocks.length ? 'frozen' : 'cooked', cookedAt: now, updatedAt: now })
  const frozen = blocks.reduce((n, b) => n + b.countInitial, 0)
  const summary = `Cooked ${input.recipe.title}${frozen ? `; ${frozen} blocks to the freezer` : ''}${afterItems.length ? `; ${afterItems.length} pantry items updated` : ''}`
  const event = await logEvent(repo, householdId, actor, { entityType: 'cook_sessions', entityId: session.id, action: 'cook', summary, after: session, cookSessionId: session.id })
  return {
    event,
    undo: async () => {
      if (beforeItems.length) await repo.table('items').putMany(beforeItems)
      for (const b of blocks) await repo.table('freezer_blocks').remove(b.id)
      if (input.session) await repo.table('cook_sessions').put(input.session)
      else await repo.table('cook_sessions').remove(session.id)
      await repo.table('recipes').put(recipeBefore)
      if (entryBefore) await repo.table('plan_entries').put(entryBefore)
      if (batchBefore) await repo.table('batches').put(batchBefore)
      const undo = await logEvent(repo, householdId, actor, { entityType: 'cook_sessions', entityId: session.id, action: 'undo', summary: `Undid: ${summary}`, undoOfEventId: event.id })
      await repo.table('activity_events').patch(event.id, { undoneByEventId: undo.id })
    },
  }
}
