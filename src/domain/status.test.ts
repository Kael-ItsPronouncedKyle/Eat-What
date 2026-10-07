import { describe, it, expect } from 'vitest'
import {
  EXPIRY_LABEL,
  EXPIRY_THIS_WEEK,
  EXPIRY_TWO_DAYS,
  applyDelta,
  cycleStatus,
  daysUntilUseBy,
  defaultUseBy,
  deriveStatus,
  expiryHorizon,
  needsRestock,
  setQuantity,
} from './status'
import { SHELF_LIFE_DAYS_BY_CATEGORY } from './types'
import type { Item, ItemCategory, StockStatus, TenantRow } from './types'

/* ------------------------------------------------------------------------------------------------
   Fixtures
   ------------------------------------------------------------------------------------------------ */

function tenant(id: string): TenantRow {
  return {
    id,
    householdId: 'hh-denton',
    createdAt: '2026-10-01T12:00:00Z',
    createdBy: 'user-liam',
    updatedAt: '2026-10-01T12:00:00Z',
    updatedBy: 'user-liam',
    deletedAt: null,
  }
}

function item(patch: Partial<Item> = {}): Item {
  return {
    ...tenant('item-1'),
    name: 'Black beans',
    canonicalName: 'black bean',
    category: 'pantry',
    locationId: null,
    trackMode: 'status',
    status: 'ok',
    qty: null,
    unit: null,
    par: null,
    useBy: null,
    barcode: null,
    imagePath: null,
    alwaysHave: false,
    autoList: true,
    personId: null,
    defaultShelfLifeDays: null,
    notes: null,
    sortOrder: 0,
    ...patch,
  }
}

function countItem(qty: number | null, par: number | null = null, patch: Partial<Item> = {}): Item {
  return item({ trackMode: 'count', qty, par, unit: 'cans', ...patch })
}

function statusItem(status: StockStatus, patch: Partial<Item> = {}): Item {
  return item({ trackMode: 'status', status, ...patch })
}

const TODAY = '2026-10-07'

/* ------------------------------------------------------------------------------------------------
   deriveStatus
   ------------------------------------------------------------------------------------------------ */

describe('deriveStatus', () => {
  describe('status mode keeps the stored status', () => {
    it.each<StockStatus>(['ok', 'low', 'out'])('returns stored %s', (status) => {
      expect(deriveStatus(statusItem(status))).toBe(status)
    })

    it('ignores qty and par in status mode', () => {
      expect(deriveStatus(statusItem('ok', { qty: 0, par: 5 }))).toBe('ok')
      expect(deriveStatus(statusItem('out', { qty: 10, par: 1 }))).toBe('out')
      expect(deriveStatus(statusItem('low', { qty: 10, par: null }))).toBe('low')
    })
  })

  describe('count mode derives from qty and par', () => {
    it('qty 0 is Out', () => {
      expect(deriveStatus(countItem(0))).toBe('out')
      expect(deriveStatus(countItem(0, 3))).toBe('out')
    })

    it('negative qty is Out', () => {
      expect(deriveStatus(countItem(-2, 3))).toBe('out')
    })

    it('null qty reads as 0 and is Out', () => {
      expect(deriveStatus(countItem(null))).toBe('out')
      expect(deriveStatus(countItem(null, 3, { status: 'ok' }))).toBe('out')
    })

    it('non-finite qty reads as 0 and is Out', () => {
      expect(deriveStatus(countItem(Number.NaN, 3))).toBe('out')
      expect(deriveStatus(countItem(Number.POSITIVE_INFINITY, 3))).toBe('out')
      expect(deriveStatus(countItem(Number.NEGATIVE_INFINITY, 3))).toBe('out')
    })

    it('qty below par is Low', () => {
      expect(deriveStatus(countItem(1, 2))).toBe('low')
      expect(deriveStatus(countItem(0.5, 1))).toBe('low')
    })

    it('qty equal to par is OK (only dropping below par sets Low)', () => {
      expect(deriveStatus(countItem(2, 2))).toBe('ok')
    })

    it('qty above par is OK', () => {
      expect(deriveStatus(countItem(5, 2))).toBe('ok')
    })

    it('no par never produces Low', () => {
      expect(deriveStatus(countItem(1, null))).toBe('ok')
      expect(deriveStatus(countItem(0.01, null))).toBe('ok')
    })

    it('par of 0 or negative never produces Low', () => {
      expect(deriveStatus(countItem(1, 0))).toBe('ok')
      expect(deriveStatus(countItem(1, -1))).toBe('ok')
    })

    it('does not care about the stored status', () => {
      expect(deriveStatus(countItem(5, 2, { status: 'out' }))).toBe('ok')
      expect(deriveStatus(countItem(0, 2, { status: 'ok' }))).toBe('out')
      expect(deriveStatus(countItem(1, 2, { status: 'ok' }))).toBe('low')
    })

    it('handles decimal quantities with units like lb', () => {
      expect(deriveStatus(countItem(0.25, 1, { unit: 'lb' }))).toBe('low')
      expect(deriveStatus(countItem(1.5, 1, { unit: 'lb' }))).toBe('ok')
    })
  })
})

/* ------------------------------------------------------------------------------------------------
   applyDelta
   ------------------------------------------------------------------------------------------------ */

describe('applyDelta', () => {
  it('subtracts and adds', () => {
    expect(applyDelta(countItem(4), -1).qty).toBe(3)
    expect(applyDelta(countItem(4), 2).qty).toBe(6)
  })

  it('never goes below zero', () => {
    expect(applyDelta(countItem(1), -5).qty).toBe(0)
    expect(applyDelta(countItem(0), -1).qty).toBe(0)
  })

  it('starts from 0 when qty is null', () => {
    expect(applyDelta(countItem(null), 3).qty).toBe(3)
    expect(applyDelta(countItem(null), -3).qty).toBe(0)
  })

  it('re-derives status in count mode', () => {
    const start = countItem(3, 2, { status: 'ok' })
    const low = applyDelta(start, -2)
    expect(low.qty).toBe(1)
    expect(low.status).toBe('low')

    const out = applyDelta(low, -1)
    expect(out.qty).toBe(0)
    expect(out.status).toBe('out')

    const back = applyDelta(out, 4)
    expect(back.qty).toBe(4)
    expect(back.status).toBe('ok')
  })

  it('hitting zero sets Out even when par is unset', () => {
    expect(applyDelta(countItem(1), -1).status).toBe('out')
  })

  it('status mode updates qty but keeps the stored status', () => {
    const next = applyDelta(statusItem('ok', { qty: 2, par: 5 }), -2)
    expect(next.qty).toBe(0)
    expect(next.status).toBe('ok')
  })

  it('status mode with no qty starts from zero and keeps status', () => {
    const next = applyDelta(statusItem('low'), 2)
    expect(next.qty).toBe(2)
    expect(next.status).toBe('low')
  })

  it('does not mutate the input', () => {
    const start = countItem(3, 2)
    const copy = { ...start }
    const next = applyDelta(start, -3)
    expect(start).toEqual(copy)
    expect(next).not.toBe(start)
  })

  it('keeps every other field', () => {
    const start = countItem(3, 2, { name: 'Tomato soup', unit: 'cans', locationId: 'loc-pantry', useBy: '2027-01-01' })
    const next = applyDelta(start, -1)
    expect(next).toEqual({ ...start, qty: 2, status: 'ok' })
  })

  it('avoids floating point drift', () => {
    expect(applyDelta(countItem(0.1), 0.2).qty).toBe(0.3)
    expect(applyDelta(countItem(1), -0.9).qty).toBe(0.1)
  })

  it('treats a non-finite delta as no change', () => {
    const start = countItem(3, 2)
    expect(applyDelta(start, Number.NaN).qty).toBe(3)
    expect(applyDelta(start, Number.POSITIVE_INFINITY).qty).toBe(3)
    expect(applyDelta(start, Number.NEGATIVE_INFINITY).qty).toBe(3)
  })

  it('a zero delta still fixes a stale status', () => {
    const stale = countItem(0, 2, { status: 'ok' })
    expect(applyDelta(stale, 0).status).toBe('out')
  })
})

/* ------------------------------------------------------------------------------------------------
   setQuantity
   ------------------------------------------------------------------------------------------------ */

describe('setQuantity', () => {
  it('sets an absolute quantity', () => {
    expect(setQuantity(countItem(1), 7).qty).toBe(7)
    expect(setQuantity(countItem(null), 2.5).qty).toBe(2.5)
  })

  it('clamps negatives to zero', () => {
    expect(setQuantity(countItem(5), -1).qty).toBe(0)
  })

  it('treats a non-finite qty as zero', () => {
    expect(setQuantity(countItem(5), Number.NaN).qty).toBe(0)
    expect(setQuantity(countItem(5), Number.NaN).status).toBe('out')
  })

  it('re-derives status in count mode', () => {
    expect(setQuantity(countItem(5, 2), 0).status).toBe('out')
    expect(setQuantity(countItem(5, 2), 1).status).toBe('low')
    expect(setQuantity(countItem(0, 2), 2).status).toBe('ok')
    expect(setQuantity(countItem(0, 2), 9).status).toBe('ok')
  })

  it('status mode updates qty but keeps the stored status', () => {
    const next = setQuantity(statusItem('low', { par: 2 }), 9)
    expect(next.qty).toBe(9)
    expect(next.status).toBe('low')
  })

  it('does not mutate the input', () => {
    const start = countItem(3, 2)
    const copy = { ...start }
    setQuantity(start, 0)
    expect(start).toEqual(copy)
  })

  it('rounds to three decimals', () => {
    expect(setQuantity(countItem(0), 1.23456).qty).toBe(1.235)
    expect(setQuantity(countItem(0), 0.1 + 0.2).qty).toBe(0.3)
  })
})

/* ------------------------------------------------------------------------------------------------
   cycleStatus
   ------------------------------------------------------------------------------------------------ */

describe('cycleStatus', () => {
  it('goes OK -> Low -> Out -> OK', () => {
    expect(cycleStatus('ok')).toBe('low')
    expect(cycleStatus('low')).toBe('out')
    expect(cycleStatus('out')).toBe('ok')
  })

  it('three taps come back to the start', () => {
    for (const start of ['ok', 'low', 'out'] as const) {
      expect(cycleStatus(cycleStatus(cycleStatus(start)))).toBe(start)
    }
  })
})

/* ------------------------------------------------------------------------------------------------
   expiryHorizon and daysUntilUseBy
   ------------------------------------------------------------------------------------------------ */

describe('daysUntilUseBy', () => {
  it('is null without a use-by date', () => {
    expect(daysUntilUseBy(item({ useBy: null }), TODAY)).toBeNull()
    expect(daysUntilUseBy(item({ useBy: '' }), TODAY)).toBeNull()
  })

  it('counts whole days, negative when past', () => {
    expect(daysUntilUseBy(item({ useBy: '2026-10-07' }), TODAY)).toBe(0)
    expect(daysUntilUseBy(item({ useBy: '2026-10-10' }), TODAY)).toBe(3)
    expect(daysUntilUseBy(item({ useBy: '2026-10-01' }), TODAY)).toBe(-6)
  })

  it('is null for a date that cannot be read', () => {
    expect(daysUntilUseBy(item({ useBy: 'soon' }), TODAY)).toBeNull()
  })
})

describe('expiryHorizon', () => {
  it('exposes the horizon widths the spec names', () => {
    expect(EXPIRY_TWO_DAYS).toBe(2)
    expect(EXPIRY_THIS_WEEK).toBe(7)
  })

  it('is null without a use-by date', () => {
    expect(expiryHorizon(item({ useBy: null }), TODAY)).toBeNull()
  })

  it('is expired when use-by is before today', () => {
    expect(expiryHorizon(item({ useBy: '2026-10-06' }), TODAY)).toBe('expired')
    expect(expiryHorizon(item({ useBy: '2025-01-01' }), TODAY)).toBe('expired')
  })

  it('today counts as two_days, not expired', () => {
    expect(expiryHorizon(item({ useBy: TODAY }), TODAY)).toBe('two_days')
  })

  it('is two_days up to and including today + 2', () => {
    expect(expiryHorizon(item({ useBy: '2026-10-08' }), TODAY)).toBe('two_days')
    expect(expiryHorizon(item({ useBy: '2026-10-09' }), TODAY)).toBe('two_days')
  })

  it('is this_week from today + 3 up to and including today + 7', () => {
    expect(expiryHorizon(item({ useBy: '2026-10-10' }), TODAY)).toBe('this_week')
    expect(expiryHorizon(item({ useBy: '2026-10-14' }), TODAY)).toBe('this_week')
  })

  it('is null past today + 7', () => {
    expect(expiryHorizon(item({ useBy: '2026-10-15' }), TODAY)).toBeNull()
    expect(expiryHorizon(item({ useBy: '2027-10-07' }), TODAY)).toBeNull()
  })

  it('spec example: on Wednesday the half-and-half that expires Friday is in the 2-day window', () => {
    const wednesday = '2026-10-07'
    const friday = '2026-10-09'
    expect(expiryHorizon(item({ name: 'Half and half', category: 'dairy', useBy: friday }), wednesday)).toBe('two_days')
  })

  it('crosses month and year boundaries', () => {
    expect(expiryHorizon(item({ useBy: '2026-11-01' }), '2026-10-30')).toBe('two_days')
    expect(expiryHorizon(item({ useBy: '2027-01-02' }), '2026-12-31')).toBe('two_days')
    expect(expiryHorizon(item({ useBy: '2027-01-07' }), '2026-12-31')).toBe('this_week')
    expect(expiryHorizon(item({ useBy: '2027-01-08' }), '2026-12-31')).toBeNull()
  })

  it('is steady across the US daylight-saving change', () => {
    // 2026-11-01 is when clocks fall back in the US; whole-day math must not slip.
    expect(expiryHorizon(item({ useBy: '2026-11-02' }), '2026-10-31')).toBe('two_days')
    expect(expiryHorizon(item({ useBy: '2026-11-07' }), '2026-10-31')).toBe('this_week')
    expect(expiryHorizon(item({ useBy: '2026-11-08' }), '2026-10-31')).toBeNull()
    expect(expiryHorizon(item({ useBy: '2026-03-10' }), '2026-03-08')).toBe('two_days')
  })

  it('is null for a date that cannot be read', () => {
    expect(expiryHorizon(item({ useBy: 'next week' }), TODAY)).toBeNull()
  })

  it('does not depend on track mode or status', () => {
    expect(expiryHorizon(countItem(0, 2, { useBy: '2026-10-05' }), TODAY)).toBe('expired')
    expect(expiryHorizon(statusItem('out', { useBy: '2026-10-08' }), TODAY)).toBe('two_days')
  })
})

describe('EXPIRY_LABEL', () => {
  it('has plain words for every horizon', () => {
    expect(EXPIRY_LABEL.expired).toBeTruthy()
    expect(EXPIRY_LABEL.two_days).toBeTruthy()
    expect(EXPIRY_LABEL.this_week).toBeTruthy()
  })

  it('expired reads "compost it" with no guilt', () => {
    expect(EXPIRY_LABEL.expired.toLowerCase()).toContain('compost it')
    expect(EXPIRY_LABEL.expired.toLowerCase()).not.toContain('waste')
  })
})

/* ------------------------------------------------------------------------------------------------
   needsRestock
   ------------------------------------------------------------------------------------------------ */

describe('needsRestock', () => {
  it('status mode: Low and Out with auto-list on need restock', () => {
    expect(needsRestock(statusItem('low'))).toBe(true)
    expect(needsRestock(statusItem('out'))).toBe(true)
  })

  it('status mode: OK does not', () => {
    expect(needsRestock(statusItem('ok'))).toBe(false)
  })

  it('auto-list off never adds to the list', () => {
    expect(needsRestock(statusItem('low', { autoList: false }))).toBe(false)
    expect(needsRestock(statusItem('out', { autoList: false }))).toBe(false)
    expect(needsRestock(countItem(0, 2, { autoList: false }))).toBe(false)
  })

  it('count mode derives from qty and par, not the stored status', () => {
    expect(needsRestock(countItem(0, 2, { status: 'ok' }))).toBe(true)
    expect(needsRestock(countItem(1, 2, { status: 'ok' }))).toBe(true)
    expect(needsRestock(countItem(2, 2, { status: 'out' }))).toBe(false)
    expect(needsRestock(countItem(5, null, { status: 'low' }))).toBe(false)
  })

  it('count mode with no qty recorded is Out and needs restock', () => {
    expect(needsRestock(countItem(null))).toBe(true)
  })

  it('a deleted item never needs restock', () => {
    expect(needsRestock(statusItem('out', { deletedAt: '2026-10-02T00:00:00Z' }))).toBe(false)
    expect(needsRestock(countItem(0, 2, { deletedAt: '2026-10-02T00:00:00Z' }))).toBe(false)
  })
})

/* ------------------------------------------------------------------------------------------------
   defaultUseBy
   ------------------------------------------------------------------------------------------------ */

describe('defaultUseBy', () => {
  it('uses the item shelf life first', () => {
    expect(defaultUseBy({ category: 'dairy', defaultShelfLifeDays: 5 }, TODAY)).toBe('2026-10-12')
    expect(defaultUseBy({ category: 'cleaning', defaultShelfLifeDays: 10 }, TODAY)).toBe('2026-10-17')
  })

  it('falls back to the category table', () => {
    expect(defaultUseBy({ category: 'dairy', defaultShelfLifeDays: null }, TODAY)).toBe('2026-10-21')
    expect(defaultUseBy({ category: 'produce', defaultShelfLifeDays: null }, TODAY)).toBe('2026-10-14')
    expect(defaultUseBy({ category: 'meat', defaultShelfLifeDays: null }, TODAY)).toBe('2026-10-10')
    expect(defaultUseBy({ category: 'seafood', defaultShelfLifeDays: null }, TODAY)).toBe('2026-10-09')
    expect(defaultUseBy({ category: 'bakery', defaultShelfLifeDays: null }, TODAY)).toBe('2026-10-12')
  })

  it('spec examples: fresh herbs 7 days, dairy 14, canned 2 years', () => {
    expect(defaultUseBy({ category: 'produce', defaultShelfLifeDays: null }, '2026-10-07')).toBe('2026-10-14')
    expect(defaultUseBy({ category: 'dairy', defaultShelfLifeDays: null }, '2026-10-07')).toBe('2026-10-21')
    expect(defaultUseBy({ category: 'pantry', defaultShelfLifeDays: null }, '2026-10-07')).toBe('2028-10-06')
  })

  it('matches every entry in SHELF_LIFE_DAYS_BY_CATEGORY', () => {
    for (const [category, days] of Object.entries(SHELF_LIFE_DAYS_BY_CATEGORY) as [ItemCategory, number][]) {
      const expected = new Date(2026, 9, 7)
      expected.setDate(expected.getDate() + days)
      const key = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, '0')}-${String(expected.getDate()).padStart(2, '0')}`
      expect(defaultUseBy({ category, defaultShelfLifeDays: null }, TODAY)).toBe(key)
    }
  })

  it('is null for categories with no shelf life', () => {
    for (const category of ['cleaning', 'paper', 'pet', 'pharmacy', 'personal', 'household', 'other'] as const) {
      expect(defaultUseBy({ category, defaultShelfLifeDays: null }, TODAY)).toBeNull()
    }
  })

  it('zero or negative item shelf life falls through to the category', () => {
    expect(defaultUseBy({ category: 'dairy', defaultShelfLifeDays: 0 }, TODAY)).toBe('2026-10-21')
    expect(defaultUseBy({ category: 'dairy', defaultShelfLifeDays: -3 }, TODAY)).toBe('2026-10-21')
    expect(defaultUseBy({ category: 'cleaning', defaultShelfLifeDays: 0 }, TODAY)).toBeNull()
  })

  it('non-finite item shelf life falls through to the category', () => {
    expect(defaultUseBy({ category: 'meat', defaultShelfLifeDays: Number.NaN }, TODAY)).toBe('2026-10-10')
    expect(defaultUseBy({ category: 'other', defaultShelfLifeDays: Number.POSITIVE_INFINITY }, TODAY)).toBeNull()
  })

  it('rounds a fractional shelf life down', () => {
    expect(defaultUseBy({ category: 'dairy', defaultShelfLifeDays: 2.9 }, TODAY)).toBe('2026-10-09')
  })

  it('crosses month and year boundaries', () => {
    expect(defaultUseBy({ category: 'produce', defaultShelfLifeDays: null }, '2026-12-28')).toBe('2027-01-04')
    expect(defaultUseBy({ category: 'meat', defaultShelfLifeDays: null }, '2026-10-30')).toBe('2026-11-02')
  })

  it('accepts a full Item', () => {
    expect(defaultUseBy(item({ category: 'seafood' }), TODAY)).toBe('2026-10-09')
  })

  it('the result lands in the expected horizon when used right away', () => {
    const useBy = defaultUseBy({ category: 'seafood', defaultShelfLifeDays: null }, TODAY)
    expect(expiryHorizon(item({ useBy }), TODAY)).toBe('two_days')
    const herbs = defaultUseBy({ category: 'produce', defaultShelfLifeDays: null }, TODAY)
    expect(expiryHorizon(item({ useBy: herbs }), TODAY)).toBe('this_week')
    const canned = defaultUseBy({ category: 'pantry', defaultShelfLifeDays: null }, TODAY)
    expect(expiryHorizon(item({ useBy: canned }), TODAY)).toBeNull()
  })
})
