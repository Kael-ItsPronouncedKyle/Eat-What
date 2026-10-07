import { describe, it, expect } from 'vitest'
import { container, recipe, row } from './fixtures.test-helpers'
import { containerAvailability, planContainers, portionLabel, recipeYieldMl, suggestContainerPlan } from './containers'
import type { Batch } from './types'

const two = container('Souper Cubes 2-cup', 'tray', 480, 8)
const one = container('Souper Cubes 1-cup', 'tray', 240, 2)
const bag = container('Quart zip bag', 'bag', 950, 3)
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
  it('availability across a day', () => {
    const b = (count: number): Batch => ({ ...row(), cookWeekId: null, recipeId: 'r', kind: 'cooked', multiplier: 1, containerPlan: [{ containerId: two.id, count, portionMl: 480, portionLabel: '2-cup' }], cookPersonId: null, scheduledOn: '2026-10-10', status: 'planned', cookedAt: null, estimatedCostCents: null, notes: null })
    const a = containerAvailability([b(6), b(4)], containers)
    expect(a).toEqual([{ container: two, owned: 8, needed: 10, short: 2 }])
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
