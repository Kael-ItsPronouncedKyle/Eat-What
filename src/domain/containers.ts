import type { Batch, Container, ContainerPlanLine, Recipe } from './types'

export const ML_PER_CUP = 240

const YIELD_ML: Record<string, number> = {
  serving: 360, servings: 360, portion: 360, portions: 360, bowl: 360, bowls: 360,
  cup: 240, cups: 240, pint: 473, pints: 473, quart: 946, quarts: 946, qt: 946, liter: 1000, liters: 1000, litre: 1000, litres: 1000, l: 1000, ml: 1, gallon: 3785, gallons: 3785,
}

/** Volume one base yield of the recipe makes. Null for unknown units. */
export function recipeYieldMl(recipe: Pick<Recipe, 'baseYield' | 'yieldUnit'>): number | null {
  const unit = (recipe.yieldUnit ?? '').trim().toLowerCase()
  const per = YIELD_ML[unit]
  if (per === undefined || !(recipe.baseYield > 0)) return null
  return recipe.baseYield * per
}

export interface ContainerTarget {
  containerId: string
  count: number
  portionMl?: number
}

export interface ContainerMath {
  totalMl: number
  multiplier: number
  plan: ContainerPlanLine[]
  warnings: ContainerWarning[]
  freezeThenRefill: { containerId: string; rounds: number; text: string }[]
  buy: { containerId: string; name: string; count: number }[]
}

export interface ContainerWarning {
  kind: 'exceeds_owned' | 'odd_portion' | 'unknown_yield'
  containerId?: string
  text: string
}

/** Turn a recipe and a set of container targets into multiplier, plan lines, and warnings. */
export function planContainers(recipe: Recipe, targets: ContainerTarget[], containers: Container[]): ContainerMath {
  const warnings: ContainerWarning[] = []
  const plan: ContainerPlanLine[] = []
  const freezeThenRefill: ContainerMath['freezeThenRefill'] = []
  const buy: ContainerMath['buy'] = []
  let totalMl = 0
  for (const t of targets) {
    const c = containers.find((x) => x.id === t.containerId && !x.deletedAt)
    if (!c || !(t.count > 0)) continue
    const portionMl = t.portionMl && t.portionMl > 0 ? Math.min(t.portionMl, c.capacityMl) : c.capacityMl
    if (t.portionMl && t.portionMl > c.capacityMl) warnings.push({ kind: 'odd_portion', containerId: c.id, text: `${c.name} holds ${portionLabel(c.capacityMl, c)}; using that instead of ${portionLabel(t.portionMl)}.` })
    const count = Math.ceil(t.count)
    totalMl += portionMl * count
    plan.push({ containerId: c.id, count, portionMl, portionLabel: portionLabel(portionMl, c) })
    if (count > c.countOwned) {
      if (c.disposable) {
        buy.push({ containerId: c.id, name: c.name, count: count - c.countOwned })
        warnings.push({ kind: 'exceeds_owned', containerId: c.id, text: `Needs ${count} ${c.name}; you have ${c.countOwned}. Add "buy ${count - c.countOwned} ${c.name}" to the list.` })
      } else if (c.countOwned > 0) {
        const rounds = Math.ceil(count / c.countOwned)
        freezeThenRefill.push({ containerId: c.id, rounds, text: `Fill ${c.countOwned} ${c.name}, freeze, pop out, refill. ${rounds} rounds.` })
        warnings.push({ kind: 'exceeds_owned', containerId: c.id, text: `Needs ${count} ${c.name}; you have ${c.countOwned}. Freeze and refill in ${rounds} rounds.` })
      } else {
        warnings.push({ kind: 'exceeds_owned', containerId: c.id, text: `You have no ${c.name}.` })
      }
    }
  }
  const yieldMl = recipeYieldMl(recipe)
  let multiplier = 1
  if (yieldMl === null) {
    warnings.push({ kind: 'unknown_yield', text: `The recipe's yield unit "${recipe.yieldUnit}" is not a volume; set servings or cups on the recipe.` })
  } else if (totalMl > 0) {
    multiplier = Math.max(0.5, Math.ceil((totalMl / yieldMl) * 2) / 2)
  }
  return { totalMl, multiplier, plan, warnings, freezeThenRefill, buy }
}

/** Suggest a container plan for a target volume using what the household owns, largest first, leaving at most one partial. */
export function suggestContainerPlan(targetMl: number, containers: Container[]): ContainerTarget[] {
  const usable = containers.filter((c) => !c.deletedAt && c.countOwned > 0 && c.capacityMl > 0).sort((a, b) => b.capacityMl - a.capacityMl)
  const out: ContainerTarget[] = []
  let remaining = targetMl
  for (const c of usable) {
    if (remaining <= 0) break
    const fit = Math.min(c.countOwned, Math.floor(remaining / c.capacityMl))
    if (fit > 0) {
      out.push({ containerId: c.id, count: fit })
      remaining -= fit * c.capacityMl
    }
  }
  if (remaining > 0) {
    // One partial in the smallest container that still has room, else the largest.
    const smallest = usable.slice().reverse().find((c) => (out.find((o) => o.containerId === c.id)?.count ?? 0) < c.countOwned)
    const pick = smallest ?? usable[0]
    if (pick) {
      const existing = out.find((o) => o.containerId === pick.id)
      if (existing) existing.count += 1
      else out.push({ containerId: pick.id, count: 1 })
    }
  }
  return out
}

export interface ContainerAvailability {
  container: Container
  owned: number
  needed: number
  short: number
}

/** Across the batches scheduled on one day, how many of each container are needed versus owned. */
export function containerAvailability(batches: Batch[], containers: Container[]): ContainerAvailability[] {
  const needed = new Map<string, number>()
  for (const b of batches) {
    if (b.deletedAt) continue
    for (const line of b.containerPlan) needed.set(line.containerId, (needed.get(line.containerId) ?? 0) + line.count)
  }
  return containers
    .filter((c) => !c.deletedAt)
    .map((c) => {
      const n = needed.get(c.id) ?? 0
      return { container: c, owned: c.countOwned, needed: n, short: Math.max(0, n - c.countOwned) }
    })
    .filter((a) => a.needed > 0)
}

/** Human label for a portion size. */
export function portionLabel(portionMl: number, container?: Container | null): string {
  if (container?.kind === 'bag') {
    if (Math.abs(portionMl - 950) <= 60) return 'quart bag'
    if (Math.abs(portionMl - 3800) <= 200) return 'gallon bag'
    if (Math.abs(portionMl - 480) <= 40) return 'sandwich bag'
  }
  const cups = portionMl / ML_PER_CUP
  const near = (x: number) => Math.abs(cups - x) < 0.06
  if (near(0.25)) return '1/4-cup'
  if (near(0.5)) return '1/2-cup'
  if (near(0.75)) return '3/4-cup'
  if (near(1)) return '1-cup'
  if (near(1.5)) return '1 1/2-cup'
  if (near(2)) return '2-cup'
  if (near(3)) return '3-cup'
  if (near(4)) return container?.kind === 'tub' ? 'quart tub' : '4-cup'
  if (Number.isInteger(cups) && cups > 0) return `${cups}-cup`
  return `${Math.round(portionMl)} ml`
}
