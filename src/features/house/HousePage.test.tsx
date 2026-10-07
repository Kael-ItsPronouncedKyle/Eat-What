import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithApp } from '@/test/render'
import { HousePage } from './HousePage'

const PATH = '/house/*'

describe('HousePage', () => {
  // Vitest runs without globals, so Testing Library does not unmount between tests on its own.
  afterEach(() => cleanup())

  it('the menu lists Members, Rules, and Retailers for Denton', async () => {
    await renderWithApp(<HousePage />, { route: '/house', path: PATH })

    expect(await screen.findByRole('heading', { name: 'House' })).toBeInTheDocument()
    expect(await screen.findByText(/ZIP 76207/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Denton' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'College Station' })).toHaveAttribute('aria-pressed', 'false')
    expect(await screen.findByRole('button', { name: /Members and plates/ })).toHaveTextContent('2 people')
    expect(screen.getByRole('button', { name: /^Rules/ })).toHaveTextContent(/active: allergies, prep, diet, cuisine/)
    const retailers = screen.getByRole('button', { name: /Retailers and routing/ })
    for (const name of ['Instacart (Kroger)', 'Amazon', 'Walmart', 'In person']) expect(retailers).toHaveTextContent(name)
    expect(screen.getByRole('button', { name: /Activity feed/ })).toBeInTheDocument()
  })

  it('Rules shows the seeded coconut rule and parses a plain sentence into a preview', async () => {
    const user = userEvent.setup()
    await renderWithApp(<HousePage />, { route: '/house', path: PATH })
    await user.click(await screen.findByRole('button', { name: /^Rules/ }))

    expect(await screen.findByRole('heading', { name: 'Rules' })).toBeInTheDocument()
    expect(await screen.findByText("Sarah can't have coconut. Swap in lime juice.")).toBeInTheDocument()
    expect(screen.getByText("Sarah doesn't like cilantro. Swap in scallion greens.")).toBeInTheDocument()

    const add = screen.getByRole('button', { name: 'Add this rule' })
    expect(add).toBeDisabled()
    await user.type(screen.getByLabelText('Say it plainly'), "Liam can't have shellfish")
    const preview = screen.getByText('no shellfish').closest('[role="status"]') as HTMLElement
    expect(within(preview).getByText('Liam')).toBeInTheDocument()
    expect(within(preview).getByText('avoid')).toBeInTheDocument()
    expect(within(preview).queryByText(/^swap /)).not.toBeInTheDocument()
    expect(add).toBeEnabled()

    await user.clear(screen.getByLabelText('Say it plainly'))
    await user.type(screen.getByLabelText('Say it plainly'), 'Sarah is allergic to peanuts, swap sunflower butter')
    const severe = screen.getByText('no peanuts').closest('[role="status"]') as HTMLElement
    expect(within(severe).getByText('Sarah')).toBeInTheDocument()
    expect(within(severe).getByText('swap sunflower butter')).toBeInTheDocument()
    expect(within(severe).getByText('severe')).toBeInTheDocument()
  })

  it('adding a rule saves it with undo and shows up in the activity feed', async () => {
    const user = userEvent.setup()
    const { repo } = await renderWithApp(<HousePage />, { route: '/house/rules', path: PATH })
    await user.type(await screen.findByLabelText('Say it plainly'), "Liam can't have shellfish")
    await user.click(screen.getByRole('button', { name: 'Add this rule' }))

    expect(await screen.findByTestId('undo-bar')).toHaveTextContent('Liam: no shellfish')
    expect(await screen.findByText("Liam can't have shellfish.")).toBeInTheDocument()
    expect(screen.getByLabelText('Say it plainly')).toHaveValue('')
    const denton = (await repo.session()).activeHouseholdId!
    const rules = await repo.table('rules').list(denton)
    const added = rules.find((r) => r.type === 'allergy' && (r.payload as { ingredient?: string }).ingredient === 'shellfish')
    expect(added?.active).toBe(true)

    await user.click(screen.getByRole('link', { name: 'Back' }))
    await user.click(await screen.findByRole('button', { name: /Activity feed/ }))
    expect(await screen.findByRole('heading', { name: 'Activity' })).toBeInTheDocument()
    // The undo bar may still be up, so read the feed row through its own undo button.
    const undo = await screen.findByRole('button', { name: 'Undo: Liam: no shellfish' })
    const row = undo.closest('.activity-row') as HTMLElement
    expect(row).toHaveTextContent('Today')
    expect(row).toHaveTextContent('Liam: no shellfish')
    // Who did it comes from the profiles collection, which loads on its own.
    expect(await within(row).findByText('Liam')).toBeInTheDocument()
  })
})
