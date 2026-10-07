import { describe, it, expect } from 'vitest'
import { block, entry, recipeWith, TODAY } from './fixtures.test-helpers'
import { autoFill, badDay, entriesForDay } from './plan'
import type { Suggestion } from './suggestions'

const chili = recipeWith({ title: 'Chili', effortScore: 3 }, [])
const soup = recipeWith({ title: 'Soup', effortScore: 2 }, [])
const stew = recipeWith({ title: 'Stew', effortScore: 4 }, [])
const burrito = recipeWith({ title: 'Burritos', effortScore: 1, tags: ['microwave_only'] }, [])
const recipes = [chili, soup, stew, burrito]

describe('badDay', () => {
  it('moves tonight forward, chains, and promotes the oldest freezer block', () => {
    const entries = [entry(TODAY, { recipeId: chili.id }), entry('2026-10-08', { recipeId: soup.id }), entry('2026-10-10', { recipeId: stew.id })]
    const blocks = [block('Taco meat', { cookedOn: '2026-09-10' }), block('Marinara', { cookedOn: '2026-08-01' }), block('Empty', { cookedOn: '2026-07-01', countRemaining: 0 })]
    const r = badDay(entries, TODAY, { freezerBlocks: blocks, recipes, householdId: 'h' })
    const moves = Object.fromEntries(r.changes.map((c) => [c.entry.recipeId, c.patch.date]))
    expect(moves[chili.id]).toBe('2026-10-08')
    expect(moves[soup.id]).toBe('2026-10-09')
    expect(moves[stew.id]).toBeUndefined()
    expect(r.tonight).toMatchObject({ kind: 'freezer_block', date: TODAY, slot: 'dinner' })
    expect(r.tonight!.freezerBlockId).toBe(blocks[1]!.id)
    expect(r.message).toContain('Marinara')
    expect(r.message.toLowerCase()).not.toContain('should')
  })
  it('falls back to a no-cook recipe, then to a kind message', () => {
    const r = badDay([], TODAY, { freezerBlocks: [], recipes, householdId: 'h' })
    expect(r.tonight).toMatchObject({ kind: 'recipe', recipeId: burrito.id })
    const r2 = badDay([], TODAY, { freezerBlocks: [], recipes: [chili], householdId: 'h' })
    expect(r2.tonight).toBeNull()
    expect(r2.message).toContain("that's fine")
  })
  it('respects a person filter on blocks', () => {
    const blocks = [block('Sarah soup', { cookedOn: '2026-08-01', personId: 'sarah' }), block('Shared', { cookedOn: '2026-09-01' })]
    expect(badDay([], TODAY, { freezerBlocks: blocks, recipes, householdId: 'h', personId: 'liam' }).tonight!.freezerBlockId).toBe(blocks[1]!.id)
  })
})

describe('autoFill', () => {
  const sug = (r: typeof chili, cost: number | null, mode: Suggestion['mode'] = 'make_now'): Suggestion => ({ recipe: r, mode, score: 1, terms: [], availability: { recipe: r, ingredients: [], completeness: 1, missing: [], expiringItems: [] }, missing: [], expiringUsed: [], freezerBlock: null, substitutions: [], allergyBlocks: [], costPerServingCents: cost, effortScore: r.effortScore })
  const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']
  it('fills open slots, takes freezer nights from the oldest blocks, skips taken days and recent repeats', () => {
    const blocks = [block('Taco meat', { cookedOn: '2026-09-10', countRemaining: 1 }), block('Marinara', { cookedOn: '2026-08-01' })]
    const existing = [entry('2026-10-13', { recipeId: stew.id }), entry('2026-10-05', { recipeId: chili.id })]
    const p = autoFill([sug(chili, 300), sug(soup, 200), sug(stew, 400)], existing, blocks, { days, freezerNights: 2, noRepeatDays: 10 })
    expect(p.slots.map((s) => s.freezerBlock?.title ?? s.suggestion?.recipe.title ?? s.note)).toEqual(['Marinara', 'Taco meat', 'Chili', 'Soup'])
    expect(p.partial).toBe(false)
    expect(p.estimatedCents).toBe((300 + 200) * 2)
  })
  it('cheap week prefers low cost and stops at the target', () => {
    const p = autoFill([sug(stew, 400), sug(chili, 300), sug(soup, 150)], [], [], { days: days.slice(0, 3), budgetCents: 1000 })
    expect(p.slots.map((s) => s.suggestion?.recipe.title ?? s.note)).toEqual(['Soup', 'Chili', 'Over the dollar target; left open.'])
    expect(p.partial).toBe(true)
  })
  it('energy little keeps only easy recipes', () => {
    const p = autoFill([sug(stew, 400), sug(soup, 150)], [], [], { days: days.slice(0, 1), energy: 'little' })
    expect(p.slots[0]!.suggestion!.recipe.title).toBe('Soup')
  })
  it('entriesForDay orders by slot then position', () => {
    const e = [entry(TODAY, { slot: 'dinner', position: 1 }), entry(TODAY, { slot: 'breakfast' }), entry(TODAY, { slot: 'dinner', position: 0 }), entry('2026-10-08')]
    expect(entriesForDay(e, TODAY).map((x) => `${x.slot}${x.position}`)).toEqual(['breakfast0', 'dinner0', 'dinner1'])
  })
})
