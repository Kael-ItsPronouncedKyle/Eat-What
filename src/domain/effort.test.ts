import { describe, it, expect } from 'vitest'
import {
  EFFORT_EASY_MAX,
  EFFORT_EASY_TAGS,
  EFFORT_LABEL,
  EFFORT_MAX,
  EFFORT_MIN,
  EFFORT_POINTS_AT_MAX,
  EFFORT_POINTS_AT_MIN,
  EFFORT_POINT_COST,
  EFFORT_SOME_WORK_MAX,
  EFFORT_TAG_DISCOUNT,
  EFFORT_TAG_DISCOUNT_CAP,
  effortBreakdown,
  effortLabel,
  effortScore,
  standingMinutes,
} from './effort'
import type { Recipe, RecipeStep, RecipeTag, TenantRow } from './types'

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

function step(text: string, patch: Partial<RecipeStep> = {}): RecipeStep {
  return { text, ...patch }
}

/** n plain steps with no timing on them. */
function plainSteps(n: number): RecipeStep[] {
  return Array.from({ length: n }, (_, i) => step(`Step ${i + 1}`))
}

function recipe(patch: Partial<Recipe> = {}): Recipe {
  return {
    ...tenant('recipe-1'),
    libraryId: null,
    variantOfRecipeId: null,
    variantLabel: null,
    title: 'Black bean soup',
    description: null,
    cuisine: 'Mexican',
    mealType: 'dinner',
    baseYield: 6,
    yieldUnit: 'servings',
    steps: [],
    freezeNotes: null,
    reheatNotes: {},
    plateNotes: {},
    equipment: [],
    tags: [],
    activeMinutes: null,
    standingMinutes: null,
    totalMinutes: null,
    dishesCount: null,
    effortScore: null,
    nutrition: null,
    costPerServingCents: null,
    source: 'bank',
    sourceUrl: null,
    status: 'approved',
    imagePath: null,
    lastCookedAt: null,
    timesCooked: 0,
    ...patch,
  }
}

/** A recipe with every effort input filled in. */
function cook(active: number, standing: number, stepCount: number, dishes: number, tags: RecipeTag[] = [], patch: Partial<Recipe> = {}): Recipe {
  return recipe({
    activeMinutes: active,
    standingMinutes: standing,
    steps: plainSteps(stepCount),
    dishesCount: dishes,
    tags,
    ...patch,
  })
}

/** The score the documented formula predicts, before tags and clamping. */
function expectedRaw(active: number, standing: number, steps: number, dishes: number): number {
  const points = active / 15 + standing / 10 + steps / 4 + dishes / 3
  return 1 + (4 * (points - 1)) / 10
}

function roundTenth(n: number): number {
  return Math.round(n * 10) / 10
}

/* ------------------------------------------------------------------------------------------------
   effortScore
   ------------------------------------------------------------------------------------------------ */

describe('effortScore', () => {
  describe('spec anchors', () => {
    it('10 active, 5 standing, 3 steps, 1 dish is about 1.5', () => {
      expect(effortScore(cook(10, 5, 3, 1))).toBe(1.5)
    })

    it('a 90-minute multi-dish cook is 5', () => {
      // 60 hands-on minutes (40 of them standing) plus 30 unattended, 10 steps, 5 dishes.
      expect(effortScore(cook(60, 40, 10, 5, [], { totalMinutes: 90 }))).toBe(5)
    })

    it('a bigger weekend cook is still 5', () => {
      expect(effortScore(cook(75, 45, 9, 6, [], { totalMinutes: 120 }))).toBe(5)
    })

    it('reheating a block is 1', () => {
      expect(effortScore(cook(2, 0, 1, 1))).toBe(1)
    })
  })

  describe('formula', () => {
    it('15 active minutes earn one point, worth 0.4 on the score', () => {
      expect(effortScore(cook(15, 0, 0, 0))).toBe(1)
      expect(effortScore(cook(30, 0, 0, 0))).toBe(1.4)
      expect(effortScore(cook(45, 0, 0, 0))).toBe(1.8)
    })

    it('10 standing minutes earn one point', () => {
      expect(effortScore(cook(0, 10, 0, 0))).toBe(1)
      expect(effortScore(cook(0, 20, 0, 0))).toBe(1.4)
    })

    it('4 steps earn one point', () => {
      expect(effortScore(cook(0, 0, 4, 0))).toBe(1)
      expect(effortScore(cook(0, 0, 8, 0))).toBe(1.4)
    })

    it('3 dishes earn one point', () => {
      expect(effortScore(cook(0, 0, 0, 3))).toBe(1)
      expect(effortScore(cook(0, 0, 0, 6))).toBe(1.4)
    })

    it('matches the documented points formula for a mixed recipe', () => {
      const r = cook(32, 17, 7, 4)
      expect(effortScore(r)).toBe(roundTenth(expectedRaw(32, 17, 7, 4)))
      expect(effortBreakdown(r).points).toBeCloseTo(32 / 15 + 17 / 10 + 7 / 4 + 4 / 3, 10)
    })

    it('exports the costs and anchors the formula is built on', () => {
      expect(EFFORT_POINT_COST).toEqual({ activeMinutes: 15, standingMinutes: 10, steps: 4, dishes: 3 })
      expect(EFFORT_POINTS_AT_MIN).toBe(1)
      expect(EFFORT_POINTS_AT_MAX).toBe(11)
      expect(EFFORT_MIN).toBe(1)
      expect(EFFORT_MAX).toBe(5)
    })

    it('rounds to one decimal', () => {
      const s = effortScore(cook(23, 11, 5, 2))
      expect(s).toBe(roundTenth(s))
      expect(String(s).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(1)
    })

    it('never goes below 1', () => {
      expect(effortScore(cook(0, 0, 0, 0))).toBe(1)
      expect(effortScore(cook(1, 0, 1, 0))).toBe(1)
    })

    it('never goes above 5', () => {
      expect(effortScore(cook(300, 200, 40, 20))).toBe(5)
    })

    it('always lands in 1..5 with one decimal across a grid of inputs', () => {
      for (const active of [0, 5, 20, 45, 90, 180]) {
        for (const standing of [0, 10, 30, 60]) {
          for (const steps of [0, 3, 8, 15]) {
            for (const dishes of [0, 1, 3, 6]) {
              const s = effortScore(cook(active, standing, steps, dishes))
              expect(s).toBeGreaterThanOrEqual(1)
              expect(s).toBeLessThanOrEqual(5)
              expect(s).toBe(roundTenth(s))
            }
          }
        }
      }
    })

    it('more active minutes never lowers the score', () => {
      let last = 0
      for (let active = 0; active <= 120; active += 5) {
        const s = effortScore(cook(active, 10, 4, 2))
        expect(s).toBeGreaterThanOrEqual(last)
        last = s
      }
    })

    it('more standing, steps or dishes never lowers the score', () => {
      let last = 0
      for (let standing = 0; standing <= 60; standing += 5) {
        const s = effortScore(cook(20, standing, 4, 2))
        expect(s).toBeGreaterThanOrEqual(last)
        last = s
      }
      last = 0
      for (let steps = 0; steps <= 20; steps += 1) {
        const s = effortScore(cook(20, 10, steps, 2))
        expect(s).toBeGreaterThanOrEqual(last)
        last = s
      }
      last = 0
      for (let dishes = 0; dishes <= 10; dishes += 1) {
        const s = effortScore(cook(20, 10, 4, dishes))
        expect(s).toBeGreaterThanOrEqual(last)
        last = s
      }
    })
  })

  describe('easy-mode tags', () => {
    // 30 active, 15 standing, 6 steps, 3 dishes: points 6.0, raw score 3.0.
    const base = { active: 30, standing: 15, steps: 6, dishes: 3 }

    it('a plain recipe at the base scores 3.0', () => {
      expect(effortScore(cook(base.active, base.standing, base.steps, base.dishes))).toBe(3)
    })

    it.each(['one_pot', 'no_chop', 'dump_kit', 'microwave_only'] as RecipeTag[])('%s takes 0.5 off', (tag) => {
      expect(effortScore(cook(base.active, base.standing, base.steps, base.dishes, [tag]))).toBe(2.5)
    })

    it('exports the easy tags and the discount', () => {
      expect([...EFFORT_EASY_TAGS].sort()).toEqual(['dump_kit', 'microwave_only', 'no_chop', 'one_pot'])
      expect(EFFORT_TAG_DISCOUNT).toBe(0.5)
      expect(EFFORT_TAG_DISCOUNT_CAP).toBe(1)
    })

    it('two tags take 1.0 off', () => {
      expect(effortScore(cook(base.active, base.standing, base.steps, base.dishes, ['one_pot', 'no_chop']))).toBe(2)
    })

    it('three or four tags are capped at 1.0 off', () => {
      expect(effortScore(cook(base.active, base.standing, base.steps, base.dishes, ['one_pot', 'no_chop', 'dump_kit']))).toBe(2)
      expect(effortScore(cook(base.active, base.standing, base.steps, base.dishes, ['one_pot', 'no_chop', 'dump_kit', 'microwave_only']))).toBe(2)
    })

    it('a tag listed twice counts once', () => {
      expect(effortScore(cook(base.active, base.standing, base.steps, base.dishes, ['one_pot', 'one_pot']))).toBe(2.5)
    })

    it.each(['freezer_safe', 'crockpot', 'seated_friendly', 'sheet_pan', 'grill', 'cook_from_frozen'] as RecipeTag[])('%s does not change the score', (tag) => {
      expect(effortScore(cook(base.active, base.standing, base.steps, base.dishes, [tag]))).toBe(3)
    })

    it('tags cannot push the score below 1', () => {
      expect(effortScore(cook(5, 2, 2, 1, ['one_pot', 'no_chop', 'dump_kit', 'microwave_only']))).toBe(1)
    })

    it('a very heavy one-pot cook still scores 5 (discount comes off before clamping)', () => {
      expect(effortScore(cook(120, 80, 16, 8, ['one_pot']))).toBe(5)
    })

    it('a heavy cook just over the ceiling can drop under 5 with a tag', () => {
      // 60/40/10/5: points 12.17, raw 5.47; minus 0.5 = 4.97 -> 5.0; minus 1.0 = 4.47 -> 4.5
      expect(effortScore(cook(60, 40, 10, 5, ['one_pot']))).toBe(5)
      expect(effortScore(cook(60, 40, 10, 5, ['one_pot', 'no_chop']))).toBe(4.5)
    })
  })

  describe('missing inputs', () => {
    it('active minutes fall back to the sum of step minutes', () => {
      const r = recipe({
        activeMinutes: null,
        standingMinutes: 5,
        dishesCount: 1,
        steps: [step('Chop', { minutes: 4 }), step('Cook', { minutes: 6 }), step('Serve')],
      })
      expect(effortBreakdown(r).activeMinutes).toBe(10)
      expect(effortScore(r)).toBe(effortScore(cook(10, 5, 3, 1)))
    })

    it('active minutes fall back to total minutes when steps carry no minutes', () => {
      const r = recipe({ activeMinutes: null, totalMinutes: 10, standingMinutes: 5, dishesCount: 1, steps: plainSteps(3) })
      expect(effortBreakdown(r).activeMinutes).toBe(10)
      expect(effortScore(r)).toBe(1.5)
    })

    it('active minutes use the smaller of step-minute sum and total minutes', () => {
      const stepsShort = recipe({ activeMinutes: null, totalMinutes: 60, steps: [step('A', { minutes: 10 }), step('B', { minutes: 10 })] })
      expect(effortBreakdown(stepsShort).activeMinutes).toBe(20)
      const totalShort = recipe({ activeMinutes: null, totalMinutes: 15, steps: [step('A', { minutes: 10 }), step('B', { minutes: 10 })] })
      expect(effortBreakdown(totalShort).activeMinutes).toBe(15)
    })

    it('active minutes fall back to 5 minutes a step when nothing else is known', () => {
      const r = recipe({ activeMinutes: null, totalMinutes: null, steps: plainSteps(4) })
      expect(effortBreakdown(r).activeMinutes).toBe(20)
    })

    it('a recipe with no steps and no figures scores 1', () => {
      expect(effortScore(recipe())).toBe(1)
    })

    it('negative or NaN active minutes count as missing', () => {
      const neg = recipe({ activeMinutes: -5, totalMinutes: 12, steps: plainSteps(2) })
      expect(effortBreakdown(neg).activeMinutes).toBe(12)
      const nan = recipe({ activeMinutes: Number.NaN, totalMinutes: 12, steps: plainSteps(2) })
      expect(effortBreakdown(nan).activeMinutes).toBe(12)
    })

    it('negative step minutes are skipped in the sum', () => {
      const r = recipe({ activeMinutes: null, steps: [step('A', { minutes: 8 }), step('B', { minutes: -3 })] })
      expect(effortBreakdown(r).activeMinutes).toBe(8)
    })

    it('dishes default to 2 when the recipe gives no count', () => {
      expect(effortBreakdown(recipe({ dishesCount: null })).dishes).toBe(2)
    })

    it.each(['one_pot', 'dump_kit', 'microwave_only'] as RecipeTag[])('dishes default to 1 for %s', (tag) => {
      expect(effortBreakdown(recipe({ dishesCount: null, tags: [tag] })).dishes).toBe(1)
    })

    it('a dish count of 0 is kept, not treated as missing', () => {
      expect(effortBreakdown(recipe({ dishesCount: 0 })).dishes).toBe(0)
    })

    it('negative dish counts count as missing', () => {
      expect(effortBreakdown(recipe({ dishesCount: -1 })).dishes).toBe(2)
    })

    it('standing minutes fall back to step figures and feed the score', () => {
      const r = recipe({
        activeMinutes: 10,
        standingMinutes: null,
        dishesCount: 1,
        steps: [step('Chop', { standingMinutes: 3 }), step('Stir', { standingMinutes: 2 }), step('Serve')],
      })
      expect(effortBreakdown(r).standingMinutes).toBe(5)
      expect(effortScore(r)).toBe(1.5)
    })

    it('an empty step list counts as zero steps', () => {
      expect(effortBreakdown(recipe({ activeMinutes: 10, standingMinutes: 5, dishesCount: 1, steps: [] })).steps).toBe(0)
    })
  })

  describe('realistic recipes land in the right band', () => {
    it('a crockpot dump kit is Easy', () => {
      const s = effortScore(cook(8, 8, 2, 1, ['dump_kit', 'no_chop', 'freezer_safe', 'cook_from_frozen', 'seated_friendly', 'crockpot']))
      expect(s).toBe(1)
      expect(effortLabel(s)).toBe('Easy')
    })

    it('a 15-minute one-pot dinner is Easy', () => {
      const s = effortScore(cook(15, 8, 3, 2, ['one_pot', 'freezer_safe', 'seated_friendly']))
      expect(effortLabel(s)).toBe('Easy')
    })

    it('a 35-minute one-pot soup is Some work', () => {
      const s = effortScore(cook(35, 26, 6, 3, ['one_pot', 'freezer_safe', 'seated_friendly']))
      expect(effortLabel(s)).toBe('Some work')
    })

    it('a 45-minute three-dish dinner is Some work', () => {
      const s = effortScore(cook(45, 21, 4, 3, ['freezer_safe']))
      expect(effortLabel(s)).toBe('Some work')
    })

    it('a 60-minute braise with many dishes is a Big cook', () => {
      const s = effortScore(cook(60, 40, 10, 5))
      expect(effortLabel(s)).toBe('Big cook')
    })
  })

  describe('energy gate alignment', () => {
    it('scores at or under 2 are what the little-energy gate allows', () => {
      expect(EFFORT_EASY_MAX).toBe(2)
      expect(effortLabel(effortScore(cook(15, 5, 4, 2)))).toBe('Easy')
    })

    it('scores at or under 3.5 are what the some-energy gate allows', () => {
      expect(EFFORT_SOME_WORK_MAX).toBe(3.5)
      expect(effortLabel(effortScore(cook(40, 20, 6, 3)))).toBe('Some work')
    })
  })
})

/* ------------------------------------------------------------------------------------------------
   standingMinutes
   ------------------------------------------------------------------------------------------------ */

describe('standingMinutes', () => {
  it("uses the recipe's own figure first", () => {
    const r = recipe({ activeMinutes: 40, standingMinutes: 12, steps: [step('A', { standingMinutes: 30 })], tags: ['seated_friendly'] })
    expect(standingMinutes(r)).toBe(12)
  })

  it('keeps an own figure of 0', () => {
    const r = recipe({ activeMinutes: 40, standingMinutes: 0, steps: [step('A', { standingMinutes: 30 })] })
    expect(standingMinutes(r)).toBe(0)
  })

  it('treats a negative own figure as missing', () => {
    const r = recipe({ activeMinutes: 40, standingMinutes: -1, steps: [step('A', { standingMinutes: 7 })] })
    expect(standingMinutes(r)).toBe(7)
  })

  it('treats a NaN own figure as missing', () => {
    const r = recipe({ activeMinutes: 40, standingMinutes: Number.NaN, steps: [step('A', { standingMinutes: 7 })] })
    expect(standingMinutes(r)).toBe(7)
  })

  it('sums step standing minutes', () => {
    const r = recipe({
      activeMinutes: 40,
      standingMinutes: null,
      steps: [step('Chop', { standingMinutes: 5 }), step('Brown', { standingMinutes: 10 }), step('Simmer', { standingMinutes: 1 })],
    })
    expect(standingMinutes(r)).toBe(16)
  })

  it('steps without a standing figure add nothing to the sum', () => {
    const r = recipe({ activeMinutes: 40, standingMinutes: null, steps: [step('Chop', { standingMinutes: 5 }), step('Wait'), step('Serve', { minutes: 2 })] })
    expect(standingMinutes(r)).toBe(5)
  })

  it('a step sum of 0 still counts as a given figure', () => {
    const r = recipe({ activeMinutes: 40, standingMinutes: null, steps: [step('Sit', { standingMinutes: 0 })] })
    expect(standingMinutes(r)).toBe(0)
  })

  it('skips negative step standing minutes', () => {
    const r = recipe({ activeMinutes: 40, standingMinutes: null, steps: [step('A', { standingMinutes: 6 }), step('B', { standingMinutes: -4 })] })
    expect(standingMinutes(r)).toBe(6)
  })

  describe('estimate from active minutes and tags', () => {
    it('defaults to 60% of active minutes', () => {
      expect(standingMinutes(recipe({ activeMinutes: 30, steps: plainSteps(3) }))).toBe(18)
    })

    it.each(['seated_friendly', 'dump_kit', 'microwave_only'] as RecipeTag[])('%s drops it to 25%%', (tag) => {
      expect(standingMinutes(recipe({ activeMinutes: 40, steps: plainSteps(3), tags: [tag] }))).toBe(10)
    })

    it('no_chop trims 10 points off the share', () => {
      expect(standingMinutes(recipe({ activeMinutes: 40, steps: plainSteps(3), tags: ['no_chop'] }))).toBe(20)
    })

    it('seated and no_chop together give 15%', () => {
      expect(standingMinutes(recipe({ activeMinutes: 40, steps: plainSteps(3), tags: ['seated_friendly', 'no_chop'] }))).toBe(6)
    })

    it('two seated-style tags do not stack', () => {
      expect(standingMinutes(recipe({ activeMinutes: 40, steps: plainSteps(3), tags: ['seated_friendly', 'dump_kit'] }))).toBe(10)
    })

    it('other tags leave the default share alone', () => {
      expect(standingMinutes(recipe({ activeMinutes: 30, steps: plainSteps(3), tags: ['one_pot', 'freezer_safe', 'crockpot'] }))).toBe(18)
    })

    it('rounds to whole minutes', () => {
      expect(standingMinutes(recipe({ activeMinutes: 7, steps: plainSteps(1) }))).toBe(4)
      expect(standingMinutes(recipe({ activeMinutes: 35, steps: plainSteps(1) }))).toBe(21)
      expect(Number.isInteger(standingMinutes(recipe({ activeMinutes: 13, steps: plainSteps(1) })))).toBe(true)
    })

    it('derives active minutes from step minutes when the recipe has none', () => {
      const r = recipe({ activeMinutes: null, steps: [step('A', { minutes: 10 }), step('B', { minutes: 10 })] })
      expect(standingMinutes(r)).toBe(12)
    })

    it('guesses 5 minutes a step when no minutes are known at all', () => {
      expect(standingMinutes(recipe({ activeMinutes: null, steps: plainSteps(4) }))).toBe(12)
    })

    it('is 0 for a recipe with no minutes and no steps', () => {
      expect(standingMinutes(recipe())).toBe(0)
    })

    it('never exceeds active minutes', () => {
      for (const active of [0, 1, 5, 12, 30, 90]) {
        for (const tags of [[], ['seated_friendly'], ['no_chop'], ['seated_friendly', 'no_chop']] as RecipeTag[][]) {
          expect(standingMinutes(recipe({ activeMinutes: active, steps: plainSteps(2), tags }))).toBeLessThanOrEqual(active)
        }
      }
    })

    it('treats negative active minutes as missing and falls through to steps', () => {
      const r = recipe({ activeMinutes: -10, steps: [step('A', { minutes: 20 })] })
      expect(standingMinutes(r)).toBe(12)
    })
  })
})

/* ------------------------------------------------------------------------------------------------
   effortLabel
   ------------------------------------------------------------------------------------------------ */

describe('effortLabel', () => {
  it('reads Easy at 2 and under', () => {
    expect(effortLabel(1)).toBe('Easy')
    expect(effortLabel(1.5)).toBe('Easy')
    expect(effortLabel(2)).toBe('Easy')
  })

  it('reads Some work from just over 2 up to 3.5', () => {
    expect(effortLabel(2.1)).toBe('Some work')
    expect(effortLabel(3)).toBe('Some work')
    expect(effortLabel(3.5)).toBe('Some work')
  })

  it('reads Big cook above 3.5', () => {
    expect(effortLabel(3.6)).toBe('Big cook')
    expect(effortLabel(4)).toBe('Big cook')
    expect(effortLabel(5)).toBe('Big cook')
  })

  it('reads Not rated for a missing score', () => {
    expect(effortLabel(null)).toBe('Not rated')
  })

  it('reads Not rated for a score that is not a real number', () => {
    expect(effortLabel(Number.NaN)).toBe('Not rated')
    expect(effortLabel(Number.POSITIVE_INFINITY)).toBe('Not rated')
  })

  it('exposes the label strings it uses', () => {
    expect(EFFORT_LABEL).toEqual({ easy: 'Easy', someWork: 'Some work', bigCook: 'Big cook', unrated: 'Not rated' })
  })

  it('uses plain words: short, no digits, no code-style names', () => {
    for (const label of Object.values(EFFORT_LABEL)) {
      expect(label.split(' ').length).toBeLessThanOrEqual(2)
      expect(label).not.toMatch(/[0-9_]/)
      expect(label.length).toBeLessThanOrEqual(12)
      expect(label.charAt(0)).toBe(label.charAt(0).toUpperCase())
    }
  })

  it('agrees with the energy-gate thresholds in CONTRACTS.md', () => {
    expect(effortLabel(EFFORT_EASY_MAX)).toBe('Easy')
    expect(effortLabel(EFFORT_EASY_MAX + 0.1)).toBe('Some work')
    expect(effortLabel(EFFORT_SOME_WORK_MAX)).toBe('Some work')
    expect(effortLabel(EFFORT_SOME_WORK_MAX + 0.1)).toBe('Big cook')
  })
})

/* ------------------------------------------------------------------------------------------------
   effortBreakdown
   ------------------------------------------------------------------------------------------------ */

describe('effortBreakdown', () => {
  it('reports every input and the points behind the score', () => {
    const b = effortBreakdown(cook(10, 5, 3, 1))
    expect(b.activeMinutes).toBe(10)
    expect(b.standingMinutes).toBe(5)
    expect(b.steps).toBe(3)
    expect(b.dishes).toBe(1)
    expect(b.points).toBeCloseTo(2.25, 10)
    expect(b.score).toBe(1.5)
    expect(b.label).toBe('Easy')
    expect(b.estimated).toEqual([])
    expect(b.easyTags).toEqual([])
    expect(b.tagDiscount).toBe(0)
  })

  it('flags which inputs were estimated', () => {
    const b = effortBreakdown(recipe({ activeMinutes: null, standingMinutes: null, dishesCount: null, steps: plainSteps(2) }))
    expect(b.estimated).toEqual(['activeMinutes', 'standingMinutes', 'dishes'])
  })

  it('does not flag standing minutes taken from steps as estimated', () => {
    const b = effortBreakdown(recipe({ activeMinutes: 20, standingMinutes: null, dishesCount: 2, steps: [step('A', { standingMinutes: 4 })] }))
    expect(b.estimated).toEqual([])
    expect(b.standingMinutes).toBe(4)
  })

  it('lists the easy tags it found, once each, and the discount they earned', () => {
    const b = effortBreakdown(cook(30, 15, 6, 3, ['freezer_safe', 'one_pot', 'no_chop', 'one_pot']))
    expect(b.easyTags).toEqual(['one_pot', 'no_chop'])
    expect(b.tagDiscount).toBe(1)
    expect(b.score).toBe(2)
  })

  it('caps the discount at 1 even with every easy tag', () => {
    const b = effortBreakdown(cook(30, 15, 6, 3, ['one_pot', 'no_chop', 'dump_kit', 'microwave_only']))
    expect(b.easyTags).toHaveLength(4)
    expect(b.tagDiscount).toBe(1)
  })

  it('score and label match effortScore and effortLabel', () => {
    const r = cook(45, 21, 4, 3, ['freezer_safe'])
    const b = effortBreakdown(r)
    expect(b.score).toBe(effortScore(r))
    expect(b.label).toBe(effortLabel(b.score))
  })

  it('does not change the recipe it reads', () => {
    const r = cook(30, 15, 6, 3, ['one_pot', 'one_pot'])
    const before = JSON.stringify(r)
    effortBreakdown(r)
    effortScore(r)
    standingMinutes(r)
    expect(JSON.stringify(r)).toBe(before)
  })
})
