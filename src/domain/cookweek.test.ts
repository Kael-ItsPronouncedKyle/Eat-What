import { describe, it, expect } from 'vitest'
import { container, item, recipeWith, row } from './fixtures.test-helpers'
import { buildTimeline, frozenMeatFor, isFrozenMeat, isTray, timelineText, TIMELINE_KIND_ORDER } from './cookweek'
import type { Batch, ContainerPlanLine, FreezerBlock, Location } from './types'

const two = container('Souper Cubes 2-cup', 'tray', 480, 2, { cavities: 4 })
const bag = container('Quart zip bag', 'bag', 950, 10, { cavities: 1 })
const containers = [two, bag]

const freezer: Location = { ...row(), name: 'Garage freezer', kind: 'freezer', parentId: null, isFreezerShelf: false, sortOrder: 0 }
const fridge: Location = { ...row(), name: 'Fridge', kind: 'fridge', parentId: null, isFreezerShelf: false, sortOrder: 1 }
const shelf: Location = { ...row(), name: 'Top shelf', kind: 'custom', parentId: freezer.id, isFreezerShelf: true, sortOrder: 2 }
const chickenThighs = item({ name: 'chicken thighs', canonicalName: 'chicken thigh', category: 'meat', locationId: freezer.id })
const groundBeef = item({ name: 'ground beef', canonicalName: 'ground beef', category: 'meat', locationId: shelf.id })
const freshFish = item({ name: 'salmon', canonicalName: 'salmon', category: 'seafood', locationId: fridge.id })
const beans = item({ name: 'black beans', canonicalName: 'black bean', category: 'pantry', locationId: null })
const items = [chickenThighs, groundBeef, freshFish, beans]
const locations = [freezer, fridge, shelf]

const chili = recipeWith({ title: 'Beef chili', totalMinutes: 90, standingMinutes: 15, activeMinutes: 25 }, [['ground beef', 2, 'lb'], ['black beans', 2, 'can']])
const curry = recipeWith({ title: 'Chicken curry', totalMinutes: 60, standingMinutes: 30, activeMinutes: 20 }, [['chicken thighs', 2, 'lb']])
const recipes = [chili, curry]

const week = { startsOn: '2026-10-12', endsOn: '2026-10-18' }
const line = (c = two, count = 8): ContainerPlanLine => ({ containerId: c.id, count, portionMl: c.capacityMl, portionLabel: c === two ? '2-cup' : 'quart bag' })
const batch = (recipeId: string, scheduledOn: string | null, plan: ContainerPlanLine[], o: Partial<Batch> = {}): Batch => ({ ...row(), cookWeekId: 'w', recipeId, kind: 'cooked', multiplier: 1.5, containerPlan: plan, cookPersonId: null, scheduledOn, status: 'planned', cookedAt: null, estimatedCostCents: null, notes: null, ...o })
const opts = { items, locations, maxStandingMinutes: 20 }

describe('frozen meat detection', () => {
  it('counts meat and seafood in a freezer or on a freezer shelf, not in the fridge or pantry', () => {
    expect(isFrozenMeat(chickenThighs, locations)).toBe(true)
    expect(isFrozenMeat(groundBeef, locations)).toBe(true)
    expect(isFrozenMeat(freshFish, locations)).toBe(false)
    expect(isFrozenMeat(beans, locations)).toBe(false)
  })
  it('finds the frozen meat a recipe needs by matching its ingredients', () => {
    expect(frozenMeatFor(curry, opts).map((i) => i.name)).toEqual(['chicken thighs'])
    expect(frozenMeatFor(chili, opts).map((i) => i.name)).toEqual(['ground beef'])
  })
  it('trays are reusable containers with cavities; bags are not', () => {
    expect(isTray(two)).toBe(true)
    expect(isTray(bag)).toBe(false)
  })
})

describe('buildTimeline: two batches that reuse the 2-cup trays', () => {
  // Chili on Tuesday fills both 2-cup trays (8 blocks); curry on Thursday needs the same trays again.
  const tue = '2026-10-13'
  const thu = '2026-10-15'
  const batches = [batch(curry.id, thu, [line(two, 8)], { createdAt: '2026-10-01T00:00:00.000Z' }), batch(chili.id, tue, [line(two, 8)], { createdAt: '2026-10-02T00:00:00.000Z' })]
  const timeline = buildTimeline(week, batches, recipes, containers, [], opts)
  const day = (d: string) => timeline.find((x) => x.date === d)
  const kinds = (d: string) => day(d)?.entries.map((e) => e.kind) ?? []

  it('shops the day before the first batch and thaws the evening before each batch', () => {
    expect(timeline.map((d) => d.date)).toEqual(['2026-10-12', tue, '2026-10-14', thu, '2026-10-16'])
    expect(kinds('2026-10-12')).toEqual(['thaw', 'shop'])
    expect(day('2026-10-12')?.entries[0]?.text).toBe('Move ground beef from freezer to fridge tonight for Beef chili.')
    expect(day('2026-10-12')?.entries[1]?.text).toBe('Shop for the week. One send covers every batch. Open the list.')
    expect(day('2026-10-14')?.entries.find((e) => e.kind === 'thaw')?.text).toBe('Move chicken thighs from freezer to fridge tonight for Chicken curry.')
  })
  it('cook day: batch with minutes, sit, fill, then a label row from labels.ts', () => {
    expect(kinds(tue)).toEqual(['batch', 'sit', 'prep', 'label'])
    const e = day(tue)!.entries
    expect(e[0]).toMatchObject({ kind: 'batch', batchId: batches[1]!.id, text: 'Beef chili ×1.5', minutes: 90 })
    expect(e[1]?.text).toBe('About 18 minutes standing. Sit while it cooks.')
    expect(e[2]?.text).toBe('Fill 8 × 2-cup')
    expect(e[3]?.text).toBe('Label 8 blocks: Beef chili · 2-cup · Oct 13 × 8')
  })
  it('the morning after a tray batch pops blocks into bags and refills when the tray is needed again', () => {
    expect(kinds('2026-10-14')).toEqual(['thaw', 'pop', 'refill'])
    expect(day('2026-10-14')?.entries[1]?.text).toBe('Pop 8 blocks out of trays into bags, refill trays.')
    expect(day('2026-10-14')?.entries[2]?.text).toBe("Refill Souper Cubes 2-cup for the batch on Thu, Oct 15.")
  })
  it('a long standing time gets a sit row; the last pop has no refill', () => {
    const e = day(thu)!.entries
    expect(e.map((x) => x.kind)).toEqual(['batch', 'sit', 'prep', 'label'])
    expect(e[1]).toMatchObject({ kind: 'sit', minutes: 10 })
    expect(e[1]?.text).toContain('37 minutes standing is over your 20 minute limit')
    expect(kinds('2026-10-16')).toEqual(['pop'])
    expect(day('2026-10-16')?.entries[0]?.text).toBe('Pop 8 blocks out of trays into bags.')
  })
  it('the printed plan comes from the same rows', () => {
    const text = timelineText('Cook week of Oct 12', timeline)
    expect(text).toContain('(shop) Shop for the week')
    expect(text).toContain('- Beef chili ×1.5 (90 min)')
    expect(text).toContain('(pop) Pop 8 blocks out of trays into bags, refill trays.')
    expect(text).toContain('(refill) Refill Souper Cubes 2-cup for the batch on Thu, Oct 15.')
  })
})

describe('buildTimeline edge cases', () => {
  it('returns nothing when no batch has a day', () => {
    expect(buildTimeline(week, [batch(chili.id, null, [line()])], recipes, containers, [], opts)).toEqual([])
  })
  it('bags only: no pop or refill rows', () => {
    const t = buildTimeline(week, [batch(curry.id, '2026-10-13', [line(bag, 4)])], recipes, containers, [], opts)
    expect(t.flatMap((d) => d.entries.map((e) => e.kind))).not.toContain('pop')
    expect(t.flatMap((d) => d.entries.map((e) => e.kind))).not.toContain('refill')
  })
  it('more tray blocks than fit at once adds a note about freezing and refilling the same day', () => {
    const t = buildTimeline(week, [batch(curry.id, '2026-10-13', [line(two, 12)])], recipes, containers, [], opts)
    const note = t.find((d) => d.date === '2026-10-13')?.entries.find((e) => e.kind === 'note')
    expect(note?.text).toBe('Souper Cubes 2-cup: 12 blocks, 8 fit at once. Freeze the first 8, pop them into bags, and refill.')
    expect(t.find((d) => d.date === '2026-10-14')?.entries.map((e) => e.kind)).toEqual(['pop'])
  })
  it('blocks still in trays from the day before get popped first on the first cook day', () => {
    const fb: FreezerBlock = { ...row(), recipeId: null, batchId: 'old', containerId: two.id, locationId: null, title: 'Soup', portionLabel: '2-cup', portionMl: 480, servingsPerBlock: 2, countRemaining: 4, countInitial: 4, personId: null, cookedOn: '2026-10-12', qualityUntil: null, freezerSpot: null, foodType: 'soup', labelText: null, notes: null }
    const t = buildTimeline(week, [batch(curry.id, '2026-10-13', [line(two, 8)])], recipes, containers, [fb], opts)
    expect(t.find((d) => d.date === '2026-10-13')?.entries.map((e) => e.kind)).toEqual(['batch', 'sit', 'prep', 'label', 'pop'])
  })
  it('thaw rows come first and refill rows last within a day', () => {
    expect(TIMELINE_KIND_ORDER[0]).toBe('thaw')
    expect(TIMELINE_KIND_ORDER[TIMELINE_KIND_ORDER.length - 1]).toBe('refill')
  })
})
