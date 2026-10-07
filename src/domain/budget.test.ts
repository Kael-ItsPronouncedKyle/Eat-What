import { describe, it, expect } from 'vitest'
import { countItem, item, price, recipeWith, row, TODAY } from './fixtures.test-helpers'
import { costPerServingCents, monthSummary, monthsBack, priceFor, priceForAmount } from './budget'
import { recipeAvailability } from './matching'
import type { ListSend, Spend } from './types'

const spend = (amount: number, kind: Spend['kind'], on: string, category: Spend['category'] = 'groceries'): Spend => ({ ...row(), retailerId: null, amountCents: amount, kind, category, occurredOn: on, listSendId: null, receiptId: null, note: null })
const send = (est: number | null, status: ListSend['status'], sentAt: string, actual: number | null = null): ListSend => ({ ...row(), retailerId: null, sentBy: null, sentAt, status, estimatedTotalCents: est, actualTotalCents: actual, externalUrl: null, externalOrderRef: null, receivedAt: null, lineCount: 1 })

describe('monthSummary', () => {
  const household = { budgetMonthlyCents: 90000, budgetWarnPct: 80 }
  it('sums actual spend, committed sends, remaining, and categories', () => {
    const s = monthSummary([spend(10000, 'actual', '2026-10-02'), spend(5000, 'actual', '2026-10-03', 'cleaning'), spend(999, 'estimated', '2026-10-03'), spend(7000, 'actual', '2026-09-28')], [send(20000, 'ordered', '2026-10-05T10:00:00Z'), send(3000, 'received', '2026-10-01T10:00:00Z', 3300)], household, '2026-10')
    expect(s.spentCents).toBe(15000)
    expect(s.committedCents).toBe(20000)
    expect(s.remainingCents).toBe(55000)
    expect(s.level).toBe('ok')
    expect(s.byCategory.groceries).toBe(10000)
    expect(s.byCategory.cleaning).toBe(5000)
    expect(s.driftCents).toBe(-300)
  })
  it('warns at 80% and goes over at 100%, never blocking', () => {
    expect(monthSummary([spend(72000, 'actual', '2026-10-02')], [], household, '2026-10').level).toBe('warn')
    expect(monthSummary([spend(95000, 'actual', '2026-10-02')], [], household, '2026-10')).toMatchObject({ level: 'over', remainingCents: -5000 })
  })
  it('no cap means no level', () => {
    expect(monthSummary([spend(1, 'actual', '2026-10-02')], [], { budgetMonthlyCents: null, budgetWarnPct: 80 }, '2026-10')).toMatchObject({ level: 'no_cap', remainingCents: null, pct: null })
  })
})

describe('priceFor and costPerServing', () => {
  const thighs = countItem('Chicken thighs', 3, 'lb', 3, { canonicalName: 'chicken thigh' })
  const beans = countItem('Black beans', 4, 'can', 2, { canonicalName: 'black bean' })
  const salt = item({ name: 'Salt', canonicalName: 'salt', alwaysHave: true })
  const prices = [price(thighs.id, 299, { unit: 'lb', retailerId: 'kroger', observedOn: '2026-09-20' }), price(thighs.id, 349, { unit: 'lb', retailerId: 'heb', observedOn: TODAY }), price(beans.id, 99, { unit: 'can', source: 'starter' })]
  it('prefers the retailer, else newest anywhere; flags stale and starter', () => {
    expect(priceFor(thighs.id, 'kroger', prices, TODAY)).toMatchObject({ price: { priceCents: 299 }, stale: true, starter: false })
    expect(priceFor(thighs.id, null, prices, TODAY)!.price.priceCents).toBe(349)
    expect(priceFor(beans.id, 'kroger', prices, TODAY)).toMatchObject({ price: { priceCents: 99 }, starter: true, stale: false })
    expect(priceFor('nope', null, prices, TODAY)).toBeNull()
  })
  it('scales by convertible units and multiplies counts', () => {
    expect(priceForAmount(price('x', 299, { unit: 'lb' }), 8, 'oz')).toBe(150)
    expect(priceForAmount(price('x', 99, { unit: 'can' }), 2, 'can')).toBe(198)
    expect(priceForAmount(price('x', 99, { unit: null }), 3, null)).toBe(297)
    expect(priceForAmount(price('x', 99, { unit: 'can' }), 2, 'cup')).toBeNull()
  })
  it('costs a recipe per serving, null when a required price is missing', () => {
    const r = recipeWith({ title: 'Chili', baseYield: 4 }, [['chicken thighs', 2, 'lb', { canonicalName: 'chicken thigh' }], ['black beans', 2, 'can', { canonicalName: 'black bean' }], ['salt', 1, 'tsp', { canonicalName: 'salt' }], ['cilantro', 1, 'bunch', { canonicalName: 'cilantro', optional: true }]])
    const av = recipeAvailability(r, { items: [thighs, beans, salt], aliases: [], alwaysHave: new Set(['salt']) }, TODAY)
    // thighs 2 lb at newest 349 = 698; beans 2 cans at 99 = 198; salt skipped (always have); optional skipped. 896 / 4 = 224
    expect(costPerServingCents(av.ingredients, 4, prices, TODAY)).toBe(224)
    const r2 = recipeWith({ title: 'Mystery', baseYield: 4 }, [['saffron', 1, 'tsp', { canonicalName: 'saffron' }]])
    const av2 = recipeAvailability(r2, { items: [], aliases: [], alwaysHave: new Set() }, TODAY)
    expect(costPerServingCents(av2.ingredients, 4, prices, TODAY)).toBeNull()
  })
  it('monthsBack spans a year boundary oldest first', () => {
    expect(monthsBack('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
})
