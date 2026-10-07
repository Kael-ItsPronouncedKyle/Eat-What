import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { groupByDestination } from '@/domain/listing'
import { formatCents } from '@/domain/money'
import { renderWithApp, seededRepo } from '@/test/render'
import { ShopPage } from './ShopPage'

const PATH = '/shop/*'

describe('ShopPage', () => {
  beforeEach(() => {
    // An Instacart send opens the store in a new tab; jsdom has no window.open.
    vi.spyOn(window, 'open').mockImplementation(() => null)
  })
  // Vitest runs without globals, so Testing Library does not unmount between tests on its own.
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('groups the list by store, sends to Instacart after one confirm, and the order shows under Ordered', async () => {
    const user = userEvent.setup()
    const repo = await seededRepo()
    const denton = (await repo.session()).activeHouseholdId!
    const [lines, retailers, prices, items] = await Promise.all([repo.table('list_lines').list(denton), repo.table('retailers').list(denton), repo.table('prices').list(denton), repo.table('items').list(denton)])
    const instacart = groupByDestination(lines, retailers, { prices, items }).find((g) => g.retailer?.kind === 'instacart')!
    expect(instacart.lines).toHaveLength(2)
    expect(instacart.estimatedCents).toBeGreaterThan(0)
    const estimate = formatCents(instacart.estimatedCents)

    await renderWithApp(<ShopPage />, { repo, route: '/shop', path: PATH })
    expect(await screen.findByRole('heading', { name: 'Shop' })).toBeInTheDocument()
    const kroger = await screen.findByRole('region', { name: 'Instacart (Kroger) list' })
    expect(within(kroger).getByText(/Boneless skinless chicken thighs/)).toBeInTheDocument()
    expect(within(kroger).getByText(/Great northern beans/)).toBeInTheDocument()
    expect(within(kroger).getByText(`~${estimate}`)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Amazon list' })).toHaveTextContent('Paper towels')
    expect(screen.getByRole('region', { name: 'Walmart list' })).toHaveTextContent('Dawn dish soap')
    // The budget bar needs the household row, which loads on its own.
    expect(await screen.findByLabelText('Budget this month')).toBeInTheDocument()

    await user.click(within(kroger).getByRole('button', { name: 'Send 2 items to Instacart' }))
    const sheet = await screen.findByRole('dialog', { name: 'Send to Instacart (Kroger)' })
    expect(within(sheet).getByText('Estimated')).toBeInTheDocument()
    expect(within(sheet).getByText(estimate)).toBeInTheDocument()
    expect(within(sheet).getByText(/of this month's budget is left/)).toBeInTheDocument()

    await user.click(within(sheet).getByRole('button', { name: 'Send 2 items to Instacart' }))
    expect(window.open).toHaveBeenCalledWith(expect.stringContaining('instacart.com/store/kroger'), '_blank', 'noopener')
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Instacart (Kroger) list' })).not.toBeInTheDocument())
    expect(await screen.findByTestId('undo-bar')).toHaveTextContent('Sent 2 items to Instacart (Kroger)')
    expect(screen.getByRole('region', { name: 'Amazon list' })).toBeInTheDocument()
    const sends = await repo.table('list_sends').list(denton)
    expect(sends).toHaveLength(1)
    expect(sends[0]?.status).toBe('ordered')
    expect(sends[0]?.estimatedTotalCents).toBe(instacart.estimatedCents)
    expect((await repo.table('list_lines').list(denton)).filter((l) => l.status === 'ordered')).toHaveLength(2)

    await user.click(screen.getByRole('link', { name: 'Ordered' }))
    expect(await screen.findByRole('heading', { name: 'Ordered' })).toBeInTheDocument()
    expect(await screen.findByText('Instacart (Kroger)')).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`· 2 items · ~\\${estimate}`))).toBeInTheDocument()
    expect(screen.getByText(/Boneless skinless chicken thighs/)).toBeInTheDocument()
    expect(screen.getByText(/Great northern beans/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'It arrived' })).toBeInTheDocument()
  })

  it('the price book shows College Station its own H-E-B starter prices', async () => {
    const user = userEvent.setup()
    const repo = await seededRepo()
    const session = await repo.session()
    const cs = session.households.find((h) => h.household.name === 'College Station')!.household
    await repo.setActiveHousehold(cs.id)
    const [items, prices, retailers] = await Promise.all([repo.table('items').list(cs.id), repo.table('prices').list(cs.id), repo.table('retailers').list(cs.id)])
    const heb = retailers.find((r) => r.kind === 'heb')!
    const beef = items.find((i) => i.name === 'Ground beef')!
    const beefPrice = prices.find((p) => p.itemId === beef.id && p.retailerId === heb.id)!
    expect(beefPrice.source).toBe('starter')

    await renderWithApp(<ShopPage />, { repo, route: '/shop/prices', path: PATH })
    expect(await screen.findByRole('heading', { name: 'Price book' })).toBeInTheDocument()
    expect(await screen.findByText(/College Station · ZIP 77840/)).toBeInTheDocument()
    expect(await screen.findByText(/starter estimates or 7\+ days old/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'H-E-B' }))
    const row = await screen.findByRole('button', { name: /^Ground beef/ })
    expect(row).toHaveTextContent('H-E-B')
    expect(row).toHaveTextContent('starter estimate')
    expect(row).toHaveTextContent(`${formatCents(beefPrice.priceCents)} /lb`)
    expect(within(row).getByText('starter')).toBeInTheDocument()
  })
})
