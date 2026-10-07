import { describe, expect, it } from 'vitest'
import { hasAssemblePhase, stepPhase, stepsForPhase } from './steps'
import type { RecipeStep } from './types'

const bag: RecipeStep = { text: 'Everything into a gallon bag. Press flat.', phase: 'assemble' }
const crock: RecipeStep = { text: 'Dump frozen into the crockpot, low 9 hours.', phase: 'cook' }
const untagged: RecipeStep = { text: 'Shred and serve.' }

describe('stepPhase', () => {
  it('treats a missing phase as cook so old recipes keep working', () => {
    expect(stepPhase(untagged)).toBe('cook')
    expect(stepPhase(crock)).toBe('cook')
    expect(stepPhase(bag)).toBe('assemble')
  })
})

describe('stepsForPhase', () => {
  it('keeps only the asked phase in the original order', () => {
    const steps = [bag, crock, untagged]
    expect(stepsForPhase(steps, 'assemble')).toEqual([bag])
    expect(stepsForPhase(steps, 'cook')).toEqual([crock, untagged])
  })

  it('returns every step for cook when nothing is tagged', () => {
    const steps = [untagged, { text: 'Serve.' }]
    expect(stepsForPhase(steps, 'cook')).toEqual(steps)
    expect(stepsForPhase(steps, 'assemble')).toEqual([])
  })

  it('does not change the input', () => {
    const steps = [bag, crock]
    stepsForPhase(steps, 'assemble')
    expect(steps).toEqual([bag, crock])
  })
})

describe('hasAssemblePhase', () => {
  it('is true only when some step is an assemble step', () => {
    expect(hasAssemblePhase([bag, crock])).toBe(true)
    expect(hasAssemblePhase([crock, untagged])).toBe(false)
    expect(hasAssemblePhase([])).toBe(false)
  })
})
