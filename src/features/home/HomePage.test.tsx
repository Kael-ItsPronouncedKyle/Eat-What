import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PlanEntry, Recipe, RecipeIngredient, TenantRow } from '@/domain/types'
import { newId } from '@/domain/ids'
import { addDays, today } from '@/domain/dates'
import { canonicalName } from '@/domain/names'
import { formatCents } from '@/domain/money'
import { costPerServingCents } from '@/domain/budget'
import { recipeAvailability } from '@/domain/matching'
import { nowIso } from '@/data/repository'
import type { LocalRepository } from '@/data/local/LocalRepository'
import { renderWithApp, seededRepo } from '@/test/render'
import { HomePage } from './HomePage'

// jsdom reflects <dialog open> but ships no show/showModal/close; the shared Sheet calls close() when it hides.
const dialogProto = globalThis.HTMLDialogElement?.prototype as (HTMLDialogElement & { close?: () => void }) | undefined
if (dialogProto && typeof dialogProto.close !== 'function') {
  dialogProto.show = function (this: HTMLDialogElement) { this.setAttribute('open', '') }
  dialogProto.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', '') }
  dialogProto.close = function (this: HTMLDialogElement) { this.removeAttribute('open') }
}

function base(householdId: string): TenantRow {
  const now = nowIso()
  return { id: newId(), householdId, createdAt: now, createdBy: null, updatedAt: now, updatedBy: null, deletedAt: null }
}

async function planTonight(repo: LocalRepository, householdId: string, recipeId: string): Promise<PlanEntry> {
  const entry: PlanEntry = { ...base(householdId), date: today(), slot: 'dinner', kind: 'recipe', recipeId, freezerBlockId: null, batchId: null, personId: null, note: null, servings: null, position: 50, status: 'planned' }
  await repo.table('plan_entries').put(entry)
  return entry
}

describe('HomePage', () => {
  beforeEach(() => {
    // Energy is stored per browser and resets each morning; start every test on "some".
    localStorage.clear()
  })
  // Vitest runs without globals, so Testing Library does not unmount between tests on its own.
  afterEach(() => cleanup())

  it('shows the energy selector and tonight, and a little-energy day collapses to three big buttons', async () => {
    const user = userEvent.setup()
    const repo = await seededRepo()
    const session = await repo.session()
    const denton = session.activeHouseholdId!
    const recipes = await repo.table('recipes').list(denton)
    const beans = recipes.find((r) => r.title === 'Red beans and rice')!
    await planTonight(repo, denton, beans.id)
    await renderWithApp(<HomePage />, { repo, route: '/', path: '/' })

    expect(await screen.findByRole('heading', { name: 'Denton' })).toBeInTheDocument()
    expect(await screen.findByRole('radiogroup', { name: 'How much energy today?' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Some' })).toHaveAttribute('aria-checked', 'true')
    expect(await screen.findByRole('heading', { name: 'Tonight' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Red beans and rice' })).toHaveAttribute('href', `/cook/recipe/${beans.id}`)
    expect(screen.getByRole('button', { name: 'Bad day' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /low or out/i })).toHaveAttribute('href', '/pantry?view=low')
    expect(await screen.findByText('Budget this month')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Use it up' })).toHaveAttribute('href', '/cook?mode=use_it_up')

    await user.click(screen.getByRole('radio', { name: 'A little' }))
    const essentials = await screen.findByRole('navigation', { name: 'Essentials' })
    expect(essentials).toHaveClass('big-three')
    expect(screen.getByRole('link', { name: 'What can I make' })).toHaveAttribute('href', '/cook')
    expect(screen.getByRole('link', { name: 'Add to pantry' })).toHaveAttribute('href', '/pantry/add')
    expect(screen.getByRole('link', { name: 'Shopping list' })).toHaveAttribute('href', '/shop')
    expect(screen.queryByRole('heading', { name: 'Tonight' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show everything' }))
    expect(await screen.findByRole('heading', { name: 'Tonight' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Some' })).toHaveAttribute('aria-checked', 'true')
  })

  it('Bad day moves tonight’s cook to tomorrow, promotes a freezer block, and undoes as one action', async () => {
    const user = userEvent.setup()
    const repo = await seededRepo()
    const session = await repo.session()
    const denton = session.activeHouseholdId!
    const recipes = await repo.table('recipes').list(denton)
    const soup = recipes.find((r) => r.title === 'Chicken tortilla soup')!
    const entry = await planTonight(repo, denton, soup.id)
    const blocksTonightBefore = (await repo.table('plan_entries').list(denton)).filter((e) => e.date === today() && e.kind === 'freezer_block').length
    await renderWithApp(<HomePage />, { repo, route: '/', path: '/' })

    await user.click(await screen.findByRole('button', { name: 'Bad day' }))
    expect(await screen.findByText(/Tonight is .* from the freezer/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Do it' }))

    // Tonight's cook takes tomorrow; anything already there cascades one day further (domain rule).
    await waitFor(async () => {
      const moved = await repo.table('plan_entries').get(entry.id)
      expect(moved?.date).toBe(addDays(today(), 1))
    })
    // Tonight's freezer entry is written after the moves, so wait for it too.
    await waitFor(async () => {
      const blocksTonightAfter = (await repo.table('plan_entries').list(denton)).filter((e) => e.date === today() && e.kind === 'freezer_block').length
      expect(blocksTonightAfter).toBe(blocksTonightBefore + 1)
    })
    const undoBar = await screen.findByTestId('undo-bar')
    expect(undoBar).toHaveTextContent(/Tonight is/)

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(async () => {
      const back = await repo.table('plan_entries').get(entry.id)
      expect(back?.date).toBe(today())
    })
    await waitFor(async () => {
      const blocksTonightUndone = (await repo.table('plan_entries').list(denton)).filter((e) => e.date === today() && e.kind === 'freezer_block').length
      expect(blocksTonightUndone).toBe(blocksTonightBefore)
    })
  })

  it('prices tonight from the active household: College Station uses its own H-E-B starter prices', async () => {
    const repo = await seededRepo()
    const session = await repo.session()
    const cs = session.households.find((h) => h.household.name === 'College Station')!.household
    await repo.setActiveHousehold(cs.id)
    const items = await repo.table('items').list(cs.id)
    const prices = await repo.table('prices').list(cs.id)
    const retailers = await repo.table('retailers').list(cs.id)
    const heb = retailers.find((r) => r.kind === 'heb')!

    // The seed gives College Station its own starter price book at H-E-B for ZIP 77840.
    expect(cs.zip).toBe('77840')
    expect(prices.filter((p) => p.retailerId === heb.id && p.source === 'starter').length).toBeGreaterThan(40)

    // A small recipe priced entirely from items College Station stocks, so cost per serving is known.
    const recipe: Recipe = {
      ...base(cs.id),
      libraryId: null, variantOfRecipeId: null, variantLabel: null,
      title: 'Beef and onion skillet', description: null, cuisine: null, mealType: 'dinner',
      baseYield: 4, yieldUnit: 'servings', steps: [{ text: 'Brown it all together.' }],
      freezeNotes: null, reheatNotes: {}, plateNotes: {}, equipment: [], tags: [],
      activeMinutes: 15, standingMinutes: 10, totalMinutes: 15, dishesCount: 1, effortScore: 2,
      nutrition: null, costPerServingCents: null, source: 'manual', sourceUrl: null, status: 'approved',
      imagePath: null, lastCookedAt: null, timesCooked: 0,
    }
    const ing = (name: string, position: number, amount: number, unit: string | null): RecipeIngredient => ({
      ...base(cs.id), recipeId: recipe.id, position, ingredientName: name, canonicalName: canonicalName(name), amount, unit,
      preparation: null, optional: false, groupLabel: null, substitute: null, itemId: null, matchConfidence: null, fdcId: null, grams: null,
    })
    const ingredients = [ing('ground beef', 0, 1, 'lb'), ing('yellow onion', 1, 1, null)]
    await repo.table('recipes').put(recipe)
    await repo.table('recipe_ingredients').putMany(ingredients)
    await planTonight(repo, cs.id, recipe.id)

    const beef = items.find((i) => i.name === 'Ground beef')!
    const onion = items.find((i) => i.name === 'Yellow onion')!
    const beefPrice = prices.find((p) => p.itemId === beef.id)!
    const onionPrice = prices.find((p) => p.itemId === onion.id)!
    expect(beefPrice.retailerId).toBe(heb.id)
    const availability = recipeAvailability({ ...recipe, ingredients }, { items, aliases: [], alwaysHave: new Set() }, today())
    const expected = costPerServingCents(availability.ingredients, recipe.baseYield, prices, today())
    expect(expected).toBe(Math.round((beefPrice.priceCents + onionPrice.priceCents) / recipe.baseYield))

    await renderWithApp(<HomePage />, { repo, route: '/', path: '/' })
    expect(await screen.findByRole('heading', { name: 'College Station' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Beef and onion skillet' })).toBeInTheDocument()
    expect(await screen.findByText(`${formatCents(expected)} a serving`)).toBeInTheDocument()
    expect(screen.getByText('starter')).toBeInTheDocument()
    expect(await screen.findByText('Budget this month')).toBeInTheDocument()
  })
})
