import type { Recipe } from './types'

/** 1 (trivial) to 5 (big cook). Weighted from active minutes, standing minutes, step count, dishes. Document the formula in the implementation. */
export function effortScore(_recipe: Pick<Recipe, 'activeMinutes' | 'standingMinutes' | 'totalMinutes' | 'dishesCount' | 'steps' | 'tags'>): number {
  throw new Error('not implemented: effortScore')
}

/** Standing minutes: the recipe's own figure, else the sum of step standing minutes, else an estimate from active minutes and tags. */
export function standingMinutes(_recipe: Pick<Recipe, 'activeMinutes' | 'standingMinutes' | 'steps' | 'tags'>): number {
  throw new Error('not implemented: standingMinutes')
}

/** Short label for cards: "Easy", "Some work", "Big cook". */
export function effortLabel(_score: number | null): string {
  throw new Error('not implemented: effortLabel')
}
