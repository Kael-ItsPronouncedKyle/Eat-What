import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithApp, seededRepo } from '@/test/render'
import { useSession } from '@/app/session'
import { useCollections } from './provider'

/** Shows, per table, how many rows belong to a household other than the active one. The number must always be 0. */
function Probe() {
  const { household, households, switchHousehold } = useSession()
  const hid = household?.id ?? null
  const data = useCollections(['items', 'recipes', 'cook_weeks', 'plan_entries'] as const, hid)
  const foreign = [...data.items, ...data.recipes, ...data.cook_weeks, ...data.plan_entries].filter((r) => r.householdId !== hid).length
  const other = households.find((h) => h.id !== hid)
  return (
    <div>
      <div data-testid="active">{household?.name}</div>
      <div data-testid="busy">{String(data.loading)}</div>
      <div data-testid="foreign">{foreign}</div>
      <div data-testid="counts">{[data.items.length, data.recipes.length, data.cook_weeks.length, data.plan_entries.length].join(',')}</div>
      {other ? <button onClick={() => switchHousehold(other.id)}>Switch</button> : null}
    </div>
  )
}

describe('useCollections', () => {
  afterEach(() => cleanup())

  it('never shows the previous household after a switch, and loads every table of the new one', async () => {
    const repo = await seededRepo()
    await renderWithApp(<Probe />, { repo })
    await waitFor(() => expect(screen.getByTestId('busy').textContent).toBe('false'))
    expect(screen.getByTestId('active').textContent).toBe('Denton')
    expect(screen.getByTestId('foreign').textContent).toBe('0')
    const dentonCounts = screen.getByTestId('counts').textContent

    fireEvent.click(screen.getByText('Switch'))
    await waitFor(() => expect(screen.getByTestId('active').textContent).toBe('College Station'))
    // The moment the household changes, nothing from Denton may still be on screen.
    expect(screen.getByTestId('foreign').textContent).toBe('0')
    await waitFor(() => expect(screen.getByTestId('busy').textContent).toBe('false'))
    expect(screen.getByTestId('foreign').textContent).toBe('0')

    const cs = (await repo.session()).households.find((h) => h.household.name === 'College Station')!.household.id
    const expected = [
      (await repo.table('items').list(cs)).length,
      (await repo.table('recipes').list(cs)).length,
      (await repo.table('cook_weeks').list(cs)).length,
      (await repo.table('plan_entries').list(cs)).length,
    ].join(',')
    expect(screen.getByTestId('counts').textContent).toBe(expected)
    expect(screen.getByTestId('counts').textContent).not.toBe(dentonCounts)
  })

  it('a write that lands while the first load is in flight does not empty the other tables', async () => {
    const repo = await seededRepo()
    await renderWithApp(<Probe />, { repo })
    // The full load of four tables has just started; an undo-style write on one of them arrives now.
    const hid = (await repo.session()).activeHouseholdId!
    const item = (await repo.table('items').list(hid))[0]!
    await repo.table('items').patch(item.id, { notes: 'changed mid-load' })
    await waitFor(() => expect(screen.getByTestId('busy').textContent).toBe('false'))
    const expected = [
      (await repo.table('items').list(hid)).length,
      (await repo.table('recipes').list(hid)).length,
      (await repo.table('cook_weeks').list(hid)).length,
      (await repo.table('plan_entries').list(hid)).length,
    ].join(',')
    await waitFor(() => expect(screen.getByTestId('counts').textContent).toBe(expected))
  })
})
