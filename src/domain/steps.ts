/* Step phases for dump kits (spec: Cook-week batches, dump kits).
   A dump kit is assembled raw into a bag on cook day and cooked later from the freezer.
   Every step is a cook step unless it is tagged 'assemble'; recipes written before the phase existed keep working. */
import type { RecipeStep, StepPhase } from './types'

/** The phase a step belongs to; a step with no phase is a cook step. */
export function stepPhase(step: Pick<RecipeStep, 'phase'>): StepPhase {
  return step.phase === 'assemble' ? 'assemble' : 'cook'
}

/** Only the steps for one phase, in their original order. */
export function stepsForPhase<T extends Pick<RecipeStep, 'phase'>>(steps: readonly T[], phase: StepPhase): T[] {
  return steps.filter((s) => stepPhase(s) === phase)
}

/** True when at least one step is an assemble step, so the recipe can be bagged up as a dump kit. */
export function hasAssemblePhase(steps: readonly Pick<RecipeStep, 'phase'>[]): boolean {
  return steps.some((s) => stepPhase(s) === 'assemble')
}
