import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { renderWithApp, seededRepo } from '@/test/render'
import { qualityUntil } from '@/domain/labels'
import type { FreezerBlock } from '@/domain/types'
import { PantryPage } from './PantryPage'

const PATH = '/pantry/*'

describe('FreezerShelf Cook 1', () => {
  afterEach(() => cleanup())

  it('shows Cook 1 beside Eat 1 on a raw dump-kit block and only Eat 1 on a cooked one', async () => {
    const repo = await seededRepo()
    const denton = (await repo.session()).activeHouseholdId!
    const recipe = (await repo.table('recipes').list(denton)).find((r) => r.title === 'Pot roast dump kit')!
    const cooked = (await repo.table('freezer_blocks').list(denton)).find((b) => b.title === 'Crockpot white chicken chili')!
    const raw: FreezerBlock = {
      ...cooked,
      id: 'raw-kit-1',
      recipeId: recipe.id,
      title: recipe.title,
      portionLabel: 'gallon bag',
      portionMl: 3800,
      servingsPerBlock: 6,
      countRemaining: 2,
      countInitial: 2,
      cookedOn: cooked.cookedOn,
      qualityUntil: qualityUntil(cooked.cookedOn!, 'raw_marinated', null),
      freezerSpot: 'Chest, flat',
      foodType: 'raw_marinated',
    }
    await repo.table('freezer_blocks').put(raw)

    await renderWithApp(<PantryPage />, { repo, route: '/pantry/freezer', path: PATH })
    expect(await screen.findByRole('heading', { name: 'Freezer shelf' })).toBeInTheDocument()

    const cook = await screen.findByRole('button', { name: 'Cook 1 Pot roast dump kit' })
    expect(cook).toBeEnabled()
    expect(cook).toHaveClass('btn-lg')
    expect(screen.getByRole('button', { name: 'Eat 1 Pot roast dump kit' })).toBeEnabled()

    // A cooked block keeps Eat 1 only.
    expect(screen.getByRole('button', { name: 'Eat 1 Crockpot white chicken chili' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cook 1 Crockpot white chicken chili' })).not.toBeInTheDocument()
    // The seed has one raw kit (Slow cooker beef stew) and this test added a second; no cooked block gets one.
    expect(screen.getAllByRole('button', { name: /^Cook 1 / })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Cook 1 Slow cooker beef stew' })).toBeEnabled()
  })
})
