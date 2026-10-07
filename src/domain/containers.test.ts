import { describe, it, expect } from 'vitest'
import { container, recipe, row } from './fixtures.test-helpers'
import { blocksAtOnce, capacityText, cavitiesOf, containerAvailability, planContainers, portionLabel, recipeYieldMl, suggestContainerPlan } from './containers'
import type { Batch } from './types'

// countOwned is trays; cavities is portions per tray. Two 2-cup trays of 4 hold 8 blocks; one 1-cup tray of 2 holds 2.
const two = container('Souper Cubes 2-cup', 'tray', 480, 2, { cavities: 4 })
const one = container('Souper Cubes 1-cup', 'tray', 240, 1, { cavities: 2 })
const bag = container('Quart zip bag', 'bag', 950, 3, { cavities: 1 })
const containers = [two, one, bag]

describe('container math', () => {
  it('yield in ml from servings and cups', () => {
    expect(recipeYieldMl({ baseYield: 8, yieldUnit: 'servings' })).toBe(2880)
    expect(recipeYieldMl({ baseYield: 8, yieldUnit: 'cups' })).toBe(1920)
    expect(recipeYieldMl({ baseYield: 2, yieldUnit: 'quarts' })).toBe(1892)
    expect(recipeYieldMl({ baseYield: 12, yieldUnit: 'burritos' })).toBeNull()
  })
  it('spec example: chili 8 servings into 6 two-cup and 4 one-cup needs 1.5x and a refill round', () => {
    const chili = recipe({ title: 'Brisket chili', baseYield: 8, yieldUnit: 'servings' })
    const m = planContainers(chili, [{ containerId: two.id, count: 6 }, { containerId: one.id, count: 4 }], containers)
    expect(m.totalMl).toBe(3840)
    expect(m.multiplier).toBe(1.5)
    expect(m.plan.map((p) => `${p.count} x ${p.portionLabel}`)).toEqual(['6 x 2-cup', '4 x 1-cup'])
    expect(m.freezeThenRefill).toEqual([{ containerId: one.id, rounds: 2, text: expect.stringContaining('2 rounds') }])
    expect(m.warnings.find((w) => w.containerId === one.id)?.text).toContain('1 tray x 2 cavities = 2 blocks')
    expect(m.warnings.some((w) => w.kind === 'exceeds_owned' && w.containerId === one.id)).toBe(true)
    expect(m.buy).toEqual([])
  })
  it('disposable shortfall becomes a buy line; unknown yield warns', () => {
    const m = planContainers(recipe({ title: 'Marinara', baseYield: 8, yieldUnit: 'cups' }), [{ containerId: bag.id, count: 5, portionMl: 480 }], containers)
    expect(m.buy).toEqual([{ containerId: bag.id, name: 'Quart zip bag', count: 2 }])
    expect(m.multiplier).toBe(1.5)
    const u = planContainers(recipe({ title: 'Burritos', baseYield: 12, yieldUnit: 'burritos' }), [{ containerId: bag.id, count: 1 }], containers)
    expect(u.warnings.some((w) => w.kind === 'unknown_yield')).toBe(true)
    expect(u.multiplier).toBe(1)
  })
  it('suggests largest first with at most one partial', () => {
    expect(suggestContainerPlan(2880, containers)).toEqual([{ containerId: bag.id, count: 3 }, { containerId: one.id, count: 1 }])
    expect(suggestContainerPlan(1000, [two, one])).toEqual([{ containerId: two.id, count: 2 }, { containerId: one.id, count: 1 }])
    expect(suggestContainerPlan(100, [])).toEqual([])
  })
  it('availability across a day counts cavities', () => {
    const b = (count: number): Batch => ({ ...row(), cookWeekId: null, recipeId: 'r', kind: 'cooked', multiplier: 1, containerPlan: [{ containerId: two.id, count, portionMl: 480, portionLabel: '2-cup' }], cookPersonId: null, scheduledOn: '2026-10-10', status: 'planned', cookedAt: null, estimatedCostCents: null, notes: null })
    const a = containerAvailability([b(6), b(4)], containers)
    expect(a).toEqual([{ container: two, trays: 2, cavities: 4, owned: 8, needed: 10, short: 2 }])
    // Eight blocks fit at once in two trays of four, so no shortfall.
    expect(containerAvailability([b(8)], containers)[0]?.short).toBe(0)
  })
  it('blocks at once is trays times cavities; old rows without cavities count as 1', () => {
    expect(blocksAtOnce(two)).toBe(8)
    expect(blocksAtOnce(bag)).toBe(3)
    expect(cavitiesOf({ cavities: undefined as unknown as number })).toBe(1)
    expect(cavitiesOf({ cavities: 0 })).toBe(1)
    expect(cavitiesOf({ cavities: 2.7 })).toBe(2)
    expect(blocksAtOnce({ countOwned: 3, cavities: undefined as unknown as number })).toBe(3)
    expect(capacityText(two)).toBe('2 trays x 4 cavities = 8 blocks')
    expect(capacityText(one)).toBe('1 tray x 2 cavities = 2 blocks')
    expect(capacityText(bag)).toBe('3 bags')
  })
  it('the Denton kit: 2 trays of 2-cup, 2 of 1-cup, 1 of 1/2-cup hold 8, 12 and 8 blocks', () => {
    const big = container('Souper Cubes 2-cup', 'tray', 480, 2, { cavities: 4 })
    const mid = container('Souper Cubes 1-cup', 'tray', 240, 2, { cavities: 6 })
    const small = container('Souper Cubes 1/2-cup', 'tray', 120, 1, { cavities: 8 })
    expect([big, mid, small].map(blocksAtOnce)).toEqual([8, 12, 8])
    // 12 one-cup blocks fit at once; 13 need a refill round.
    const soup = recipe({ title: 'Soup', baseYield: 8, yieldUnit: 'cups' })
    expect(planContainers(soup, [{ containerId: mid.id, count: 12 }], [big, mid, small]).freezeThenRefill).toEqual([])
    const over = planContainers(soup, [{ containerId: mid.id, count: 13 }], [big, mid, small])
    expect(over.freezeThenRefill).toEqual([{ containerId: mid.id, rounds: 2, text: expect.stringContaining('2 trays x 6 cavities = 12 blocks') }])
    // Suggestions fill all 8 two-cup cavities before moving to the next size.
    expect(suggestContainerPlan(8 * 480, [big, mid, small])).toEqual([{ containerId: big.id, count: 8 }])
  })
  it('portion labels', () => {
    expect(portionLabel(240)).toBe('1-cup')
    expect(portionLabel(480)).toBe('2-cup')
    expect(portionLabel(120)).toBe('1/2-cup')
    expect(portionLabel(950, bag)).toBe('quart bag')
    expect(portionLabel(3800, bag)).toBe('gallon bag')
    expect(portionLabel(333)).toBe('333 ml')
  })
})
