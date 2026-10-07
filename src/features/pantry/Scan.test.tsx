import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithApp } from '@/test/render'
import { PantryPage } from './PantryPage'
import { parseTypedLines, prefillName } from './scanParse'

const PATH = '/pantry/*'

describe('Scan', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('looks up a typed barcode on Open Food Facts and offers to add the product', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 1, product: { product_name: 'Black beans', quantity: '15 oz', brands: 'Goya, Other' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    await renderWithApp(<PantryPage />, { route: '/pantry/scan', path: PATH })

    expect(await screen.findByRole('heading', { name: 'Scan' })).toBeInTheDocument()
    expect(screen.getByText(/type the numbers under the bars/i)).toBeInTheDocument()
    const field = screen.getByLabelText('Barcode number')
    await user.type(field, '041331010078')
    await user.click(screen.getByRole('button', { name: 'Look up' }))

    expect(await screen.findByText('Black beans')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String((fetchMock.mock.calls[0] as unknown[] | undefined)?.[0])).toContain('world.openfoodfacts.org/api/v2/product/041331010078.json')
    const add = screen.getByRole('link', { name: 'Add to pantry' })
    expect(add).toHaveAttribute('href', `/pantry/add?name=${encodeURIComponent('15 oz Goya Black beans')}`)
  })

  it('says plainly when the code is unknown', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 0 }), { status: 404 })))
    await renderWithApp(<PantryPage />, { route: '/pantry/scan', path: PATH })
    await user.type(await screen.findByLabelText('Barcode number'), '123456789')
    await user.click(screen.getByRole('button', { name: 'Look up' }))
    expect(await screen.findByText(/does not know this code/)).toBeInTheDocument()
  })

  it('typed receipt lines match pantry items, and Save writes prices with undo', async () => {
    const user = userEvent.setup()
    const { repo } = await renderWithApp(<PantryPage />, { route: '/pantry/scan', path: PATH })
    const denton = (await repo.session()).activeHouseholdId!
    expect(await screen.findByRole('note')).toHaveTextContent(/local mode/i)

    await user.type(screen.getByLabelText('Or type the lines'), 'Milk 3.49\nMystery gadget 9.99')
    await user.click(screen.getByRole('button', { name: 'Check these lines' }))
    const list = await screen.findByRole('list', { name: 'Receipt lines' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Pantry item: Milk')
    expect(rows[1]).toHaveTextContent('Not matched')

    await user.click(screen.getByRole('button', { name: 'Save receipt' }))
    const undoBar = await screen.findByTestId('undo-bar')
    expect(undoBar).toHaveTextContent('1 price')
    const prices = (await repo.table('prices').list(denton)).filter((p) => p.source === 'receipt')
    expect(prices).toHaveLength(1)
    expect(prices[0]!.priceCents).toBe(349)
    const receipts = await repo.table('receipts').list(denton)
    expect(receipts).toHaveLength(1)
    expect((await repo.table('receipt_lines').list(denton)).map((l) => l.status).sort()).toEqual(['matched', 'unmatched'])
    expect((await repo.table('spend').list(denton)).some((s) => s.receiptId === receipts[0]!.id && s.amountCents === 1348)).toBe(true)

    await user.click(within(undoBar).getByRole('button', { name: /undo/i }))
    await waitFor(async () => {
      expect(await repo.table('receipts').list(denton)).toHaveLength(0)
    })
    expect((await repo.table('prices').list(denton)).filter((p) => p.source === 'receipt')).toHaveLength(0)
    expect((await repo.table('receipt_lines').list(denton)).length).toBe(0)
  })

  it('parses typed lines and builds a prefill name from a product', () => {
    expect(parseTypedLines('Eggs 2 @ 2.99\nMilk 3.49\nPaper towels x2 12.99\nBread')).toEqual([
      { name: 'Eggs', qty: 2, unitPriceCents: 299, totalCents: 598 },
      { name: 'Milk', qty: null, unitPriceCents: 349, totalCents: 349 },
      { name: 'Paper towels', qty: 2, unitPriceCents: 650, totalCents: 1299 },
      { name: 'Bread', qty: null, unitPriceCents: null, totalCents: null },
    ])
    expect(prefillName({ code: '1', name: 'Whole milk', quantity: '1 gal', brand: null })).toBe('1 gallon Whole milk')
    expect(prefillName({ code: '1', name: 'Goya black beans', quantity: null, brand: 'Goya' })).toBe('Goya black beans')
  })
})
