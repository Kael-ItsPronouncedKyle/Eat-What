import type { Recipe, RecipeStep, RecipeTag } from './types'

/*
  Effort score: how much work a recipe is, from 1 (trivial) to 5 (big cook).
  The daily energy setting on Home filters against it (rules.ts energyAllows:
  little <= 2, some <= 3.5, plenty everything), and cards show effortLabel.

  Formula
  -------
  1. Work points add up four inputs, each divided by what it costs to earn one point:
         points = active / 15 + standing / 10 + steps / 4 + dishes / 3
     so 15 active minutes, 10 standing minutes, 4 steps or 3 dishes each cost one point.
  2. Points map onto 1..5 on a straight line between two anchors:
         1 point  (reheat a block: a couple of minutes, one step, one dish) -> 1
         11 points (a 90-minute, many-step, many-dish cook)                 -> 5
         score = 1 + 4 * (points - 1) / 10
  3. Easy-mode tags take 0.5 off each: one_pot, no_chop, dump_kit, microwave_only.
     The total tag discount is capped at 1.0 (two tags' worth). A tag listed twice counts once.
     The discount comes off before clamping, so a very heavy one-pot cook still scores 5.
  4. Clamp to 1..5 and round to one decimal.

  Worked examples
     10 active, 5 standing, 3 steps, 1 dish    -> points 2.25 -> 1.5
     60 active, 40 standing, 10 steps, 5 dishes -> points 12.2 -> 5
     8 active, 8 standing, 2 steps, 1 dish, dump_kit + no_chop -> points 2.2, minus 1.0 -> 1

  Missing inputs (a recipe may carry nulls)
     active minutes:   the recipe's figure; else the smaller of the step-minute sum and total
                       minutes (whichever exist); else 5 minutes a step.
     standing minutes: see standingMinutes().
     steps:            the step count (an empty list is 0).
     dishes:           the recipe's figure; else 1 for one_pot / dump_kit / microwave_only, else 2.
     Negative or NaN figures are treated as missing.
*/

export const EFFORT_MIN = 1
export const EFFORT_MAX = 5

/** How many minutes, steps or dishes earn one work point. */
export const EFFORT_POINT_COST = { activeMinutes: 15, standingMinutes: 10, steps: 4, dishes: 3 } as const

/** Points that map to a score of 1 and of 5; the line between them is straight. */
export const EFFORT_POINTS_AT_MIN = 1
export const EFFORT_POINTS_AT_MAX = 11

/** Tags that mean less work than the minutes suggest. */
export const EFFORT_EASY_TAGS: readonly RecipeTag[] = ['one_pot', 'no_chop', 'dump_kit', 'microwave_only']
export const EFFORT_TAG_DISCOUNT = 0.5
export const EFFORT_TAG_DISCOUNT_CAP = 1

/** Label and energy-gate thresholds: <= 2 Easy, <= 3.5 Some work, else Big cook. */
export const EFFORT_EASY_MAX = 2
export const EFFORT_SOME_WORK_MAX = 3.5

export const EFFORT_LABEL = {
  easy: 'Easy',
  someWork: 'Some work',
  bigCook: 'Big cook',
  unrated: 'Not rated',
} as const

/* ------------------------------------------------------------------------------------------------
   Estimation knobs for recipes that leave a figure blank
   ------------------------------------------------------------------------------------------------ */

/** Share of active minutes spent standing when the recipe gives no standing figure. */
const STANDING_SHARE_DEFAULT = 0.6
/** Share when a tag says you sit for most of it. */
const STANDING_SHARE_SEATED = 0.25
/** Chopping is the standing part; no_chop trims the share by this much. */
const STANDING_SHARE_NO_CHOP_CUT = 0.1
const SEATED_TAGS: readonly RecipeTag[] = ['seated_friendly', 'dump_kit', 'microwave_only']

/** Tags that mean one dish when the recipe gives no dish count. */
const ONE_DISH_TAGS: readonly RecipeTag[] = ['one_pot', 'dump_kit', 'microwave_only']
const DISHES_GUESS_DEFAULT = 2

/** Minutes a step is assumed to take when nothing else is known. */
const MINUTES_PER_STEP_GUESS = 5

/* ------------------------------------------------------------------------------------------------
   Public API
   ------------------------------------------------------------------------------------------------ */

export type EffortInputs = Pick<Recipe, 'activeMinutes' | 'standingMinutes' | 'totalMinutes' | 'dishesCount' | 'steps' | 'tags'>

export type EffortEstimatedInput = 'activeMinutes' | 'standingMinutes' | 'dishes'

/** Every term behind a score, so "why this" can show them. */
export interface EffortBreakdown {
  activeMinutes: number
  standingMinutes: number
  steps: number
  dishes: number
  /** Inputs the recipe left blank, so they were estimated. */
  estimated: EffortEstimatedInput[]
  /** Work points before the tag discount: active/15 + standing/10 + steps/4 + dishes/3. */
  points: number
  /** Easy-mode tags found on the recipe, each one listed once. */
  easyTags: RecipeTag[]
  /** Total taken off for easy-mode tags, 0 to 1. */
  tagDiscount: number
  /** Final score, 1 to 5, one decimal. */
  score: number
  label: string
}

/** 1 (trivial) to 5 (big cook). Weighted from active minutes, standing minutes, step count, dishes. See the formula note at the top of this file. */
export function effortScore(recipe: Pick<Recipe, 'activeMinutes' | 'standingMinutes' | 'totalMinutes' | 'dishesCount' | 'steps' | 'tags'>): number {
  return effortBreakdown(recipe).score
}

/** Standing minutes: the recipe's own figure, else the sum of step standing minutes, else an estimate from active minutes and tags. */
export function standingMinutes(recipe: Pick<Recipe, 'activeMinutes' | 'standingMinutes' | 'steps' | 'tags'>): number {
  return resolveStandingMinutes(recipe).minutes
}

/** Short label for cards: "Easy", "Some work", "Big cook". A missing score reads "Not rated". */
export function effortLabel(score: number | null): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) return EFFORT_LABEL.unrated
  if (score <= EFFORT_EASY_MAX) return EFFORT_LABEL.easy
  if (score <= EFFORT_SOME_WORK_MAX) return EFFORT_LABEL.someWork
  return EFFORT_LABEL.bigCook
}

/** The score with every term that went into it. */
export function effortBreakdown(recipe: EffortInputs): EffortBreakdown {
  const active = resolveActiveMinutes(recipe)
  const standing = resolveStandingMinutes(recipe)
  const dishes = resolveDishes(recipe)
  const steps = stepsOf(recipe).length

  const estimated: EffortEstimatedInput[] = []
  if (active.estimated) estimated.push('activeMinutes')
  if (standing.estimated) estimated.push('standingMinutes')
  if (dishes.estimated) estimated.push('dishes')

  const points =
    active.minutes / EFFORT_POINT_COST.activeMinutes +
    standing.minutes / EFFORT_POINT_COST.standingMinutes +
    steps / EFFORT_POINT_COST.steps +
    dishes.count / EFFORT_POINT_COST.dishes

  const easyTags = uniqueTags(recipe).filter((t) => EFFORT_EASY_TAGS.includes(t))
  const tagDiscount = Math.min(easyTags.length * EFFORT_TAG_DISCOUNT, EFFORT_TAG_DISCOUNT_CAP)

  const span = EFFORT_POINTS_AT_MAX - EFFORT_POINTS_AT_MIN
  const raw = EFFORT_MIN + ((EFFORT_MAX - EFFORT_MIN) * (points - EFFORT_POINTS_AT_MIN)) / span - tagDiscount
  const score = roundTenth(clamp(raw, EFFORT_MIN, EFFORT_MAX))

  return {
    activeMinutes: active.minutes,
    standingMinutes: standing.minutes,
    steps,
    dishes: dishes.count,
    estimated,
    points,
    easyTags,
    tagDiscount,
    score,
    label: effortLabel(score),
  }
}

/* ------------------------------------------------------------------------------------------------
   Internals
   ------------------------------------------------------------------------------------------------ */

interface Resolved {
  minutes: number
  estimated: boolean
}

/** A usable figure: a finite number that is not negative. Anything else counts as missing. */
function known(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null
}

function stepsOf(recipe: { steps: RecipeStep[] }): RecipeStep[] {
  return Array.isArray(recipe.steps) ? recipe.steps : []
}

function uniqueTags(recipe: { tags: RecipeTag[] }): RecipeTag[] {
  return Array.isArray(recipe.tags) ? [...new Set(recipe.tags)] : []
}

function resolveActiveMinutes(recipe: { activeMinutes: number | null; totalMinutes?: number | null; steps: RecipeStep[] }): Resolved {
  const own = known(recipe.activeMinutes)
  if (own !== null) return { minutes: own, estimated: false }

  const steps = stepsOf(recipe)
  const candidates: number[] = []
  let stepSum = 0
  let anyStepMinutes = false
  for (const step of steps) {
    const m = known(step.minutes)
    if (m !== null) {
      stepSum += m
      anyStepMinutes = true
    }
  }
  if (anyStepMinutes) candidates.push(stepSum)
  const total = known(recipe.totalMinutes)
  if (total !== null) candidates.push(total)
  if (candidates.length > 0) return { minutes: Math.min(...candidates), estimated: true }

  return { minutes: steps.length * MINUTES_PER_STEP_GUESS, estimated: true }
}

function resolveStandingMinutes(recipe: { activeMinutes: number | null; standingMinutes: number | null; totalMinutes?: number | null; steps: RecipeStep[]; tags: RecipeTag[] }): Resolved {
  const own = known(recipe.standingMinutes)
  if (own !== null) return { minutes: own, estimated: false }

  let sum = 0
  let anyStepStanding = false
  for (const step of stepsOf(recipe)) {
    const m = known(step.standingMinutes)
    if (m !== null) {
      sum += m
      anyStepStanding = true
    }
  }
  if (anyStepStanding) return { minutes: sum, estimated: false }

  const active = resolveActiveMinutes(recipe).minutes
  const tags = uniqueTags(recipe)
  let share = tags.some((t) => SEATED_TAGS.includes(t)) ? STANDING_SHARE_SEATED : STANDING_SHARE_DEFAULT
  if (tags.includes('no_chop')) share -= STANDING_SHARE_NO_CHOP_CUT
  return { minutes: Math.round(active * share), estimated: true }
}

function resolveDishes(recipe: { dishesCount: number | null; tags: RecipeTag[] }): { count: number; estimated: boolean } {
  const own = known(recipe.dishesCount)
  if (own !== null) return { count: own, estimated: false }
  const oneDish = uniqueTags(recipe).some((t) => ONE_DISH_TAGS.includes(t))
  return { count: oneDish ? 1 : DISHES_GUESS_DEFAULT, estimated: true }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function roundTenth(n: number): number {
  return Math.round(n * 10) / 10
}
