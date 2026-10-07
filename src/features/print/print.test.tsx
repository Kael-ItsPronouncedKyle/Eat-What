import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import type { Batch, CookWeek, TenantRow } from '@/domain/types'
import { newId } from '@/domain/ids'
import { addDays, today } from '@/domain/dates'
import { nowIso } from '@/data/repository'
import type { LocalRepository } from '@/data/local/LocalRepository'
import { renderWithApp, seededRepo } from '@/test/render'
import { PrintLabels } from './PrintLabels'
import { PrintWeek } from './PrintWeek'

function base(householdId: string): TenantRow {
  const now = nowIso()
  return { id: newId(), householdId, createdAt: now, createdBy: null, updatedAt: now, updatedBy: null, deletedAt: null }
}

async function seedWeek(repo: LocalRepository) {
  const session = await repo.session()
  const denton = session.activeHouseholdId!
  const recipes = await repo.table('recipes').list(denton)
  const containers = await repo.table('containers').list(denton)
  const soup = recipes.find((r) => r.title === 'Chicken tortilla soup')!
  const beans = recipes.find((r) => r.title === 'Red beans and rice')!
  const container = containers[0]!
  const starts = addDays(today(), 2)
  const week: CookWeek = { ...base(denton), name: 'Test cook week', startsOn: starts, endsOn: addDays(starts, 5), budgetTargetCents: null, status: 'draft', timeline: [] }
  const batch = (recipeId: string, day: string | null, cost: number | null): Batch => ({
    ...base(denton), cookWeekId: week.id, recipeId, kind: 'cooked', multiplier: 2,
    containerPlan: [{ containerId: container.id, count: 4, portionMl: 480, portionLabel: '2-cup' }],
    cookPersonId: null, scheduledOn: day, status: 'planned', cookedAt: null, estimatedCostCents: cost, notes: null,
  })
  const batches = [batch(soup.id, starts, 1250), batch(beans.id, addDays(starts, 1), null)]
  await repo.table('cook_weeks').put(week)
  await repo.table('batches').putMany(batches)
  return { denton, week, batches, soup, beans }
}

describe('print screens', () => {
  afterEach(() => cleanup())

  it('labels page lists one box per freezer block named in ?blocks=', async () => {
    const repo = await seededRepo()
    const session = await repo.session()
    const denton = session.activeHouseholdId!
    const blocks = (await repo.table('freezer_blocks').list(denton)).filter((b) => b.countRemaining > 0).slice(0, 3)
    expect(blocks.length).toBe(3)
    await renderWithApp(<PrintLabels />, { repo, route: `/print/labels?blocks=${blocks.map((b) => b.id).join(',')}`, path: '/print/labels' })

    const boxes = await screen.findAllByTestId('label-box')
    expect(boxes).toHaveLength(3)
    for (const [i, b] of blocks.entries()) expect(boxes[i]).toHaveTextContent(b.title)
    expect(boxes[0]).toHaveTextContent(/Cooked/)
    expect(boxes[0]).toHaveTextContent(/Best by/)
    expect(boxes[0]).toHaveTextContent('Denton')
    expect(screen.getByRole('button', { name: 'Print freezer labels' })).toHaveClass('btn-lg')
    expect(screen.getByRole('link', { name: /Back to the freezer shelf/ })).toHaveAttribute('href', '/pantry/freezer')
  })

  it('labels page for a cook week prints one box per planned container line', async () => {
    const repo = await seededRepo()
    const { week, batches } = await seedWeek(repo)
    await renderWithApp(<PrintLabels />, { repo, route: `/print/labels?week=${week.id}`, path: '/print/labels' })

    const boxes = await screen.findAllByTestId('label-box')
    expect(boxes).toHaveLength(batches.length)
    expect(boxes[0]).toHaveTextContent('Chicken tortilla soup')
    expect(boxes[0]).toHaveTextContent('4 containers')
    expect(screen.getByRole('link', { name: /Back to the cook week/ })).toHaveAttribute('href', `/cook/week/${week.id}`)
  })

  it('week page shows every batch, the day-by-day rows, and the shopping list', async () => {
    const repo = await seededRepo()
    const { week, batches, soup, beans } = await seedWeek(repo)
    await renderWithApp(<PrintWeek />, { repo, route: `/print/week/${week.id}`, path: '/print/week/:id' })

    expect(await screen.findByRole('heading', { name: 'Test cook week' })).toBeInTheDocument()
    const rows = await screen.findAllByTestId('batch-row')
    expect(rows).toHaveLength(batches.length)
    expect(rows[0]).toHaveTextContent(soup.title)
    expect(rows[0]).toHaveTextContent('$12.50')
    expect(rows[1]).toHaveTextContent(beans.title)
    // No guessed prices: the batch without an estimate prints an empty cost cell.
    expect(within(rows[1]!).getAllByRole('cell').at(-1)).toHaveTextContent('')
    expect(screen.getByText(/about \$12\.50 for 1 of 2 batches/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Day by day' })).toBeInTheDocument()
    expect(screen.getAllByText('Cook').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Shopping list' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Print ${week.name}` })).toHaveClass('btn-lg')
    expect(screen.getByRole('link', { name: /Back to the cook week/ })).toHaveAttribute('href', `/cook/week/${week.id}`)
  })

  it('week page shop row drops the on-screen link text cleanly', async () => {
    const repo = await seededRepo()
    const { week } = await seedWeek(repo)
    await renderWithApp(<PrintWeek />, { repo, route: `/print/week/${week.id}`, path: '/print/week/:id' })
    await screen.findByRole('heading', { name: 'Day by day' })
    const shop = screen.getByText(/Shop for the week/)
    expect(shop).toHaveTextContent('Shop for the week. One send covers every batch.')
    expect(shop.textContent).not.toMatch(/\s\./)
    expect(shop.textContent).not.toMatch(/Open the list/)
  })

  it('labels page says plainly when the cook week is gone', async () => {
    await renderWithApp(<PrintLabels />, { route: '/print/labels?week=nope', path: '/print/labels' })
    expect(await screen.findByText(/not here any more/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to cook weeks' })).toHaveAttribute('href', '/cook/week')
  })

  it('week page says plainly when the week is gone', async () => {
    await renderWithApp(<PrintWeek />, { route: '/print/week/nope', path: '/print/week/:id' })
    expect(await screen.findByText(/not here any more/)).toBeInTheDocument()
  })
})
