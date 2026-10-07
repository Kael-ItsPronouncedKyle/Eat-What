import { describe, expect, it } from 'vitest'
import {
  audienceRoles, dueNotifications, formatDollars, inQuietHours, inWindow, listNames, type DueInput, type LocalNow, type NotifyItem,
} from './notifications'

const at = (hour: number, minute = 0, extra: Partial<LocalNow> = {}): LocalNow => ({ date: '2026-10-07', hour, minute, weekday: 3, ...extra })

const item = (over: Partial<NotifyItem> & { name: string }): NotifyItem => ({
  id: over.name.toLowerCase().replace(/\s+/g, '-'), status: 'ok', useBy: null, autoList: true, deletedAt: null, ...over,
})

function input(over: Partial<DueInput> = {}): DueInput {
  return {
    now: at(12),
    household: { quietFrom: null, quietTo: null, budgetWarnPct: 80, weeklyShopDay: null, weeklyShopTime: null },
    items: [],
    budgetPct: null,
    overByCents: 0,
    newestPriceOn: null,
    sentKeys: [],
    ...over,
  }
}

const types = (list: ReturnType<typeof dueNotifications>) => list.map((n) => n.type)

describe('quiet hours and windows', () => {
  it('quiet hours wrap past midnight and ignore missing or equal bounds', () => {
    expect(inQuietHours({ hour: 23, minute: 0 }, '22:00', '07:00')).toBe(true)
    expect(inQuietHours({ hour: 3, minute: 30 }, '22:00', '07:00')).toBe(true)
    expect(inQuietHours({ hour: 7, minute: 0 }, '22:00', '07:00')).toBe(false)
    expect(inQuietHours({ hour: 12, minute: 0 }, '22:00', '07:00')).toBe(false)
    expect(inQuietHours({ hour: 13, minute: 0 }, '12:00', '14:00')).toBe(true)
    expect(inQuietHours({ hour: 13, minute: 0 }, null, '14:00')).toBe(false)
    expect(inQuietHours({ hour: 13, minute: 0 }, '09:00', '09:00')).toBe(false)
  })

  it('a time-of-day rule fires from its time until three hours later', () => {
    expect(inWindow({ hour: 16, minute: 59 }, '17:00')).toBe(false)
    expect(inWindow({ hour: 17, minute: 0 }, '17:00')).toBe(true)
    expect(inWindow({ hour: 19, minute: 59 }, '17:00')).toBe(true)
    expect(inWindow({ hour: 20, minute: 0 }, '17:00')).toBe(false)
  })

  it('nothing is due inside quiet hours, even a budget crossing', () => {
    const due = dueNotifications(input({
      now: at(17),
      household: { quietFrom: '16:00', quietTo: '18:00', budgetWarnPct: 80, weeklyShopDay: null, weeklyShopTime: null },
      items: [item({ name: 'Milk', status: 'out' })],
      budgetPct: 150,
      overByCents: 1200,
    }))
    expect(due).toEqual([])
  })
})

describe('low or out, once a day at 5 pm', () => {
  it('batches the outs and lows into one notification for editors with a per-day key', () => {
    const items = [item({ name: 'Milk', status: 'out' }), item({ name: 'Eggs', status: 'low' }), item({ name: 'Rice', status: 'ok' }), item({ name: 'Gone', status: 'out', deletedAt: '2026-10-01T00:00:00Z' })]
    const due = dueNotifications(input({ now: at(17, 23), items }))
    expect(types(due)).toEqual(['low_out_daily'])
    expect(due[0]).toMatchObject({ keys: ['low_out_daily:2026-10-07'], url: '/shop', audience: 'editors', title: '2 items are low or out' })
    expect(due[0]?.body).toBe('Out: Milk. Low: Eggs. Tap to see the list.')
  })

  it('is not due at noon, and not again once its key was recorded', () => {
    const items = [item({ name: 'Milk', status: 'out' })]
    expect(dueNotifications(input({ now: at(12), items }))).toEqual([])
    expect(dueNotifications(input({ now: at(18), items, sentKeys: ['low_out_daily:2026-10-07'] }))).toEqual([])
    expect(types(dueNotifications(input({ now: at(18), items, sentKeys: ['low_out_daily:2026-10-06'] })))).toEqual(['low_out_daily'])
  })

  it('names up to three items then counts the rest', () => {
    expect(listNames(['a'])).toBe('a')
    expect(listNames(['a', 'b'])).toBe('a and b')
    expect(listNames(['a', 'b', 'c'])).toBe('a, b and c')
    expect(listNames(['a', 'b', 'c', 'd', 'e'])).toBe('a, b, c and 2 more')
  })
})

describe('expiring and expired, 8 am', () => {
  const items = [
    item({ name: 'Yogurt', useBy: '2026-10-08' }),
    item({ name: 'Chicken', useBy: '2026-10-09' }),
    item({ name: 'Bread', useBy: '2026-10-12' }),
    item({ name: 'Old salsa', useBy: '2026-10-01' }),
    item({ name: 'Older dip', useBy: '2026-09-20' }),
  ]

  it('expiring within two days goes to editors and opens use-it-up; expired goes to the owner once per item', () => {
    const due = dueNotifications(input({ now: at(8, 5), items }))
    expect(types(due)).toEqual(['expiring_2_days', 'expired'])
    expect(due[0]).toMatchObject({ title: '2 items to use in the next 2 days', url: '/cook?mode=use_it_up', audience: 'editors' })
    expect(due[0]?.body).toContain('Yogurt and Chicken')
    expect(due[1]).toMatchObject({ audience: 'owner', keys: ['expired:old-salsa:2026-10-01', 'expired:older-dip:2026-09-20'] })
    expect(due[1]?.body).toMatch(/Compost them/)
  })

  it('an item reported as expired yesterday is left out today; a new date on it reports again', () => {
    const sent = ['expired:old-salsa:2026-10-01', 'expiring_2_days:2026-10-07']
    const due = dueNotifications(input({ now: at(8), items, sentKeys: sent }))
    expect(types(due)).toEqual(['expired'])
    expect(due[0]?.keys).toEqual(['expired:older-dip:2026-09-20'])
    expect(due[0]?.title).toBe('1 item past its date')
    const everything = [...sent, 'expired:older-dip:2026-09-20']
    expect(dueNotifications(input({ now: at(8), items, sentKeys: everything }))).toEqual([])
    const redated = items.map((i) => (i.id === 'old-salsa' ? { ...i, useBy: '2026-10-05' } : i))
    expect(dueNotifications(input({ now: at(8), items: redated, sentKeys: everything }))[0]?.keys).toEqual(['expired:old-salsa:2026-10-05'])
  })

  it('is not due in the evening', () => {
    expect(dueNotifications(input({ now: at(18), items }))).toEqual([])
  })
})

describe('weekly shop and stale prices', () => {
  const household = { quietFrom: null, quietTo: null, budgetWarnPct: 80, weeklyShopDay: 3, weeklyShopTime: '18:30' }

  it('the shop reminder fires on the chosen day and time, and the stale price note rides along for the owner', () => {
    const due = dueNotifications(input({ now: at(18, 40), household, newestPriceOn: '2026-09-29' }))
    expect(types(due)).toEqual(['weekly_shop', 'price_book_stale'])
    expect(due[0]).toMatchObject({ keys: ['weekly_shop:2026-10-07'], url: '/shop', audience: 'editors' })
    expect(due[1]).toMatchObject({ keys: ['price_book_stale:2026-10-07'], url: '/shop/prices', audience: 'owner' })
    expect(due[1]?.body).toContain('8 days old')
  })

  it('fresh prices stay quiet; a wrong weekday or time stays quiet; no shop day means no shop reminder', () => {
    expect(types(dueNotifications(input({ now: at(18, 40), household, newestPriceOn: '2026-10-03' })))).toEqual(['weekly_shop'])
    expect(dueNotifications(input({ now: at(18, 40, { weekday: 4 }), household, newestPriceOn: '2026-09-01' }))).toEqual([])
    expect(dueNotifications(input({ now: at(9), household, newestPriceOn: '2026-09-01' }))).toEqual([])
    const noDay = { ...household, weeklyShopDay: null }
    expect(dueNotifications(input({ now: at(18, 40), household: noDay }))).toEqual([])
  })

  it('without a shop day the stale note uses Monday 09:00, and an empty price book never nags', () => {
    const noDay = { ...household, weeklyShopDay: null, weeklyShopTime: null }
    const monday = at(9, 10, { date: '2026-10-05', weekday: 1 })
    expect(types(dueNotifications(input({ now: monday, household: noDay, newestPriceOn: '2026-09-01' })))).toEqual(['price_book_stale'])
    expect(dueNotifications(input({ now: monday, household: noDay, newestPriceOn: null }))).toEqual([])
  })

  it('a shop day without a time defaults to 09:00', () => {
    const h = { ...household, weeklyShopTime: null }
    expect(types(dueNotifications(input({ now: at(9, 30), household: h })))).toEqual(['weekly_shop'])
  })
})

describe('budget lines, once a month each', () => {
  it('80 percent (or the household warn percent) notes the owner once; 100 percent says over by how much and retires the 80 key too', () => {
    const warn = dueNotifications(input({ now: at(3), budgetPct: 82.4 }))
    expect(warn).toHaveLength(1)
    expect(warn[0]).toMatchObject({ type: 'budget_80', keys: ['budget_80:2026-10'], audience: 'owner', url: '/shop/budget', title: "82% of the month's budget used" })
    expect(dueNotifications(input({ now: at(3), budgetPct: 82.4, sentKeys: ['budget_80:2026-10'] }))).toEqual([])
    expect(dueNotifications(input({ now: at(3), budgetPct: 70, household: { quietFrom: null, quietTo: null, budgetWarnPct: 60, weeklyShopDay: null, weeklyShopTime: null } }))[0]?.type).toBe('budget_80')

    const over = dueNotifications(input({ now: at(3), budgetPct: 104, overByCents: 1200, sentKeys: ['budget_80:2026-10'] }))
    expect(over[0]).toMatchObject({ type: 'budget_100', keys: ['budget_100:2026-10'], body: 'Over by $12. Nothing is blocked; this is just so you know.' })
    const first = dueNotifications(input({ now: at(3), budgetPct: 104, overByCents: 1250 }))
    expect(first[0]?.keys).toEqual(['budget_100:2026-10', 'budget_80:2026-10'])
    expect(first[0]?.body).toContain('Over by $12.50')
  })

  it('no cap means no budget notes, and a new month starts over', () => {
    expect(dueNotifications(input({ now: at(3), budgetPct: null }))).toEqual([])
    const nov = at(3, 0, { date: '2026-11-01', weekday: 0 })
    expect(dueNotifications(input({ now: nov, budgetPct: 90, sentKeys: ['budget_80:2026-10'] }))[0]?.keys).toEqual(['budget_80:2026-11'])
  })

  it('formats dollars without trailing cents when whole', () => {
    expect(formatDollars(1200)).toBe('$12')
    expect(formatDollars(1234)).toBe('$12.34')
  })
})

describe('audiences', () => {
  it('maps the spec table to roles; agents never buzz', () => {
    expect(audienceRoles('owner')).toEqual(['owner'])
    expect(audienceRoles('editors')).toEqual(['owner', 'editor'])
    expect(audienceRoles('all_but_sender')).toEqual(['owner', 'editor', 'viewer'])
  })
})
