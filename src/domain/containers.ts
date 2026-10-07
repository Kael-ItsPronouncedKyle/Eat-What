import type { Batch, Container, ContainerPlanLine, Recipe } from './types'

export const ML_PER_CUP = 240

/** Volume one base yield of the recipe makes. servings 360 ml, portions 360, cups 240, pints 473, quarts 946, liters 1000, ml 1. Null for unknown units. */
export function recipeYieldMl(_recipe: Pick<Recipe, 'baseYield' | 'yieldUnit'>): number | null {
  throw new Error('not implemented: recipeYieldMl')
}

export interface ContainerTarget {
  containerId: string
  count: number
  /** Portion size per block; defaults to the container's capacity (one block per cavity for trays). */
  portionMl?: number
}

export interface ContainerMath {
  totalMl: number
  /** Recipe multiplier needed to fill the targets (rounded up to the nearest 0.5). */
  multiplier: number
  plan: ContainerPlanLine[]
  warnings: ContainerWarning[]
  /** Steps for reusable trays that must be frozen, popped, and refilled. */
  freezeThenRefill: { containerId: string; rounds: number; text: string }[]
  /** Disposable containers to buy ("buy a box of quart bags"). */
  buy: { containerId: string; name: string; count: number }[]
}

export interface ContainerWarning {
  kind: 'exceeds_owned' | 'odd_portion' | 'unknown_yield'
  containerId?: string
  text: string
}

/** Turn a recipe and a set of container targets into multiplier, plan lines, and warnings. */
export function planContainers(_recipe: Recipe, _targets: ContainerTarget[], _containers: Container[]): ContainerMath {
  throw new Error('not implemented: planContainers')
}

/** Suggest a container plan for a target volume using what the household owns, largest first. */
export function suggestContainerPlan(_targetMl: number, _containers: Container[]): ContainerTarget[] {
  throw new Error('not implemented: suggestContainerPlan')
}

export interface ContainerAvailability {
  container: Container
  owned: number
  needed: number
  short: number
}

/** Across the batches scheduled on one day, how many of each container are needed versus owned. */
export function containerAvailability(_batches: Batch[], _containers: Container[]): ContainerAvailability[] {
  throw new Error('not implemented: containerAvailability')
}

/** Human label for a portion size in cups ("1-cup", "2-cup", "1/2-cup", "quart bag"). */
export function portionLabel(_portionMl: number, _container?: Container | null): string {
  throw new Error('not implemented: portionLabel')
}
