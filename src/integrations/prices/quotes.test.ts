import { describe, expect, it } from 'vitest'
import { buildPrompt, extractJson, splitBatches, validateQuotes } from './quotes'

const items = [
  { id: 'eggs', name: 'Eggs', unit: 'dozen' },
  { id: 'milk', name: 'Milk', unit: 'gallon' },
  { id: 'beef', name: 'Ground beef', unit: 'lb' },
]
const today = '2026-10-07'

describe('price check quotes', () => {
  it('batches items for one call each', () => {
    expect(splitBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('the prompt names the retailer, the ZIP, every item, and the strict shape', () => {
    const p = buildPrompt({ retailerName: 'H-E-B', zip: '77840', today, items })
    expect(p).toContain('H-E-B')
    expect(p).toContain('77840')
    expect(p).toContain('id=eggs | Eggs | priced per dozen')
    expect(p).toContain('"quotes"')
    expect(p).toContain('Never estimate')
  })

  it('pulls JSON out of prose', () => {
    expect(extractJson('Here you go:\n{"quotes":[]}\nDone.')).toEqual({ quotes: [] })
    expect(extractJson('nothing here')).toBeNull()
  })

  it('keeps sourced, confident, fresh, plausible quotes and names why the rest were dropped', () => {
    const raw = {
      quotes: [
        { itemId: 'eggs', priceCents: 249, unit: 'dozen', unitQty: 1, sourceUrl: 'https://www.heb.com/p/eggs', confidence: 0.9, observedOn: '2026-10-05' },
        { itemId: 'milk', priceCents: 379, unit: 'gallon', sourceUrl: 'https://www.heb.com/p/milk', confidence: 0.5 },
        { itemId: 'beef', priceCents: 5999, unit: 'lb', sourceUrl: 'https://www.heb.com/p/beef', confidence: 0.9 },
        { itemId: 'eggs', priceCents: 300, sourceUrl: 'https://x', confidence: 0.9 },
        { itemId: 'tofu', priceCents: 300, sourceUrl: 'https://x', confidence: 0.9 },
        { itemId: 'milk', priceCents: 379, confidence: 0.9 },
      ],
    }
    const { accepted, rejected } = validateQuotes(raw, { items, today, previousCents: { beef: 599 } })
    expect(accepted).toEqual([{ itemId: 'eggs', priceCents: 249, unit: 'dozen', unitQty: 1, sourceUrl: 'https://www.heb.com/p/eggs', confidence: 0.9, observedOn: '2026-10-05' }])
    expect(rejected.map((r) => r.reason)).toEqual(['low confidence', 'outlier', 'duplicate', 'unknown item', 'no source'])
  })

  it('drops quotes older than the window or dated in the future, and defaults a missing date to today', () => {
    const raw = {
      quotes: [
        { itemId: 'eggs', priceCents: 249, sourceUrl: 'https://a', confidence: 0.8, observedOn: '2026-06-01' },
        { itemId: 'milk', priceCents: 379, sourceUrl: 'https://b', confidence: 0.8, observedOn: '2027-01-01' },
        { itemId: 'beef', priceCents: 599, sourceUrl: 'https://c', confidence: 0.8 },
      ],
    }
    const { accepted, rejected } = validateQuotes(raw, { items, today })
    expect(rejected.map((r) => r.reason)).toEqual(['stale quote', 'stale quote'])
    expect(accepted[0]).toMatchObject({ itemId: 'beef', observedOn: today, unit: 'lb' })
  })

  it('a malformed answer accepts nothing', () => {
    expect(validateQuotes(null, { items, today }).accepted).toEqual([])
    expect(validateQuotes({ quotes: 'x' }, { items, today }).rejected[0]!.reason).toBe('no quotes array')
  })
})
