import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithApp } from '@/test/render'
import { PantryPage } from './PantryPage'

const PATH = '/pantry/*'

describe('PantryPage', () => {
  // Vitest runs without globals, so Testing Library does not unmount between tests on its own.
  afterEach(() => cleanup())

  it('lists the seeded Denton items and the Low or out chip filters them', async () => {
    const user = userEvent.setup()
    await renderWithApp(<PantryPage />, { route: '/pantry', path: PATH })

    expect(await screen.findByRole('heading', { name: 'Pantry' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Paper towels' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Boneless skinless chicken thighs' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sugar' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Freezer shelf/ })).toHaveAttribute('href', '/pantry/freezer')

    const chip = screen.getByRole('button', { name: /Low or out/ })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await user.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    // Paper towels sits at 1 roll against a par of 4, so it stays; Sugar is OK and drops out.
    expect(screen.getByRole('link', { name: 'Paper towels' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sugar' })).not.toBeInTheDocument()

    await user.click(chip)
    expect(await screen.findByRole('link', { name: 'Sugar' })).toBeInTheDocument()
  })

  it('a status tap changes the item at once, shows the undo bar, and undo puts it back', async () => {
    const user = userEvent.setup()
    const { repo } = await renderWithApp(<PantryPage />, { route: '/pantry', path: PATH })
    const denton = (await repo.session()).activeHouseholdId!
    const milkStatus = async () => (await repo.table('items').list(denton)).find((i) => i.name === 'Milk')?.status

    const group = await screen.findByRole('group', { name: 'Milk status' })
    expect(within(group).getByRole('button', { name: 'OK' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(group).getByRole('button', { name: 'Low' }))

    const undoBar = await screen.findByTestId('undo-bar')
    expect(undoBar).toHaveTextContent('Milk: Low')
    await waitFor(() => {
      const low = within(screen.getByRole('group', { name: 'Milk status' })).getByRole('button', { name: 'Low' })
      expect(low).toHaveAttribute('aria-pressed', 'true')
    })
    expect(await milkStatus()).toBe('low')

    await user.click(within(undoBar).getByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect(await milkStatus()).toBe('ok'))
    await waitFor(() => {
      const ok = within(screen.getByRole('group', { name: 'Milk status' })).getByRole('button', { name: 'OK' })
      expect(ok).toHaveAttribute('aria-pressed', 'true')
    })
  })

  it('the freezer shelf shows blocks with Eat 1, and eating one lowers the count shown', async () => {
    const user = userEvent.setup()
    const { repo } = await renderWithApp(<PantryPage />, { route: '/pantry', path: PATH })
    const denton = (await repo.session()).activeHouseholdId!

    await user.click(await screen.findByRole('link', { name: /Freezer shelf/ }))
    expect(await screen.findByRole('heading', { name: 'Freezer shelf' })).toBeInTheDocument()
    expect(await screen.findByText(/blocks ready\. Oldest first/)).toBeInTheDocument()
    const eat = await screen.findByRole('button', { name: 'Eat 1 Crockpot white chicken chili' })
    expect(screen.getAllByRole('button', { name: /^Eat 1 / }).length).toBeGreaterThan(1)
    // Denton's white chicken chili is the only block seeded with 2 left, so the label is unique.
    expect(screen.getByLabelText('2 left')).toHaveTextContent('2')

    await user.click(eat)
    expect(await screen.findByLabelText('1 left')).toHaveTextContent('1')
    expect(screen.queryByLabelText('2 left')).not.toBeInTheDocument()
    expect(await screen.findByTestId('undo-bar')).toHaveTextContent('Ate 1 Crockpot white chicken chili')
    const block = (await repo.table('freezer_blocks').list(denton)).find((b) => b.title === 'Crockpot white chicken chili')
    expect(block?.countRemaining).toBe(1)
    expect(screen.getByRole('button', { name: 'Eat 1 Crockpot white chicken chili' })).toBeEnabled()
  })
})
