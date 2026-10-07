import type { Energy, Equipment, Nutrition, Person, Recipe, RecipeIngredient, Rule } from './types'
import { canonicalName } from './names'
import { ingredientHasAllergen } from './allergens'

export interface RuleContext {
  rules: Rule[]
  persons: Person[]
}

export interface AllergyViolation {
  ingredient: RecipeIngredient
  ruleId: string
  ingredientRule: string
  personId: string | null
  personName: string | null
  severity: 'avoid' | 'dislike' | 'severe'
  substitute: string | null
}

export interface Substitution {
  ingredientId: string
  from: string
  to: string
  personName: string | null
}

export interface DietFlag {
  kind: 'sodium_over' | 'protein_under' | 'calories_over' | 'calories_under'
  value: number
  limit: number
  text: string
}

type AllergyPayload = { ingredient?: string; severity?: 'avoid' | 'dislike' | 'severe'; substitute?: string }
type PrepPayload = { maxStandingMinutes?: number; seatedPreferred?: boolean; equipment?: Equipment[]; maxActiveMinutes?: number }
type DietPayload = { sodiumMaxMg?: number; proteinMinG?: number; caloriesMin?: number; caloriesMax?: number }
type CuisinePayload = { cuisine?: string; weight?: 'liked' | 'tolerated' | 'avoid' }

const activeRules = (ctx: RuleContext, type: Rule['type']) => ctx.rules.filter((r) => r.type === type && r.active && !r.deletedAt)
const personName = (ctx: RuleContext, id: string | null) => (id ? (ctx.persons.find((p) => p.id === id)?.name ?? null) : null)

/** Allergy rows that match the ingredients (whole-word canonical containment, with family aliases:
    a "nuts" rule covers almonds; see allergens.ts), optionally for one person only. */
export function allergyViolations(ingredients: RecipeIngredient[], ctx: RuleContext, personId?: string | null): AllergyViolation[] {
  const out: AllergyViolation[] = []
  const rules = activeRules(ctx, 'allergy').filter((r) => {
    const p = (r.payload as AllergyPayload).ingredient
    if (!p || !p.trim()) return false
    if (personId === undefined || personId === null) return true
    return r.appliesToPersonId === null || r.appliesToPersonId === personId
  })
  for (const ing of ingredients) {
    if (ing.deletedAt) continue
    const hay = ing.canonicalName || canonicalName(ing.ingredientName)
    for (const r of rules) {
      const payload = r.payload as AllergyPayload
      const needle = payload.ingredient!
      if (ingredientHasAllergen(hay, needle) || ingredientHasAllergen(ing.ingredientName, needle)) {
        out.push({
          ingredient: ing,
          ruleId: r.id,
          ingredientRule: needle,
          personId: r.appliesToPersonId,
          personName: personName(ctx, r.appliesToPersonId),
          severity: payload.severity ?? 'avoid',
          substitute: payload.substitute?.trim() || ing.substitute || null,
        })
      }
    }
  }
  return out
}

/** Rewrite violating ingredients with the rule's substitute when one exists; return the rest as unresolved. */
export function applySubstitutions(ingredients: RecipeIngredient[], ctx: RuleContext, personId?: string | null): { ingredients: RecipeIngredient[]; substitutions: Substitution[]; unresolved: AllergyViolation[] } {
  const violations = allergyViolations(ingredients, ctx, personId)
  const byIngredient = new Map<string, AllergyViolation[]>()
  for (const v of violations) byIngredient.set(v.ingredient.id, [...(byIngredient.get(v.ingredient.id) ?? []), v])
  const substitutions: Substitution[] = []
  const unresolved: AllergyViolation[] = []
  const out = ingredients.map((ing) => {
    const vs = byIngredient.get(ing.id)
    if (!vs || vs.length === 0) return ing
    const withSub = vs.find((v) => v.substitute)
    if (!withSub) {
      unresolved.push(...vs)
      return ing
    }
    const to = withSub.substitute!
    // A substitute that itself breaks another rule stays unresolved.
    const stillBad = allergyViolations([{ ...ing, ingredientName: to, canonicalName: canonicalName(to) }], ctx, personId)
    if (stillBad.length) {
      unresolved.push(...vs)
      return ing
    }
    substitutions.push({ ingredientId: ing.id, from: ing.ingredientName, to, personName: withSub.personName })
    return { ...ing, ingredientName: to, canonicalName: canonicalName(to), substitute: null }
  })
  return { ingredients: out, substitutions, unresolved }
}

/** liked 1.2, tolerated 1.0, avoid 0.6, unknown 1.0. Case-insensitive on cuisine. */
export function cuisineWeight(cuisine: string | null, ctx: RuleContext): number {
  if (!cuisine) return 1
  const c = cuisine.trim().toLowerCase()
  const rule = activeRules(ctx, 'cuisine').find((r) => ((r.payload as CuisinePayload).cuisine ?? '').trim().toLowerCase() === c)
  if (!rule) return 1
  const w = (rule.payload as CuisinePayload).weight
  return w === 'liked' ? 1.2 : w === 'avoid' ? 0.6 : 1
}

export interface PrepFit {
  factor: number
  standingOk: boolean
  missingEquipment: Equipment[]
}

export function prepFit(recipe: Recipe, ctx: RuleContext): PrepFit {
  const rules = activeRules(ctx, 'prep')
  const seated = recipe.tags.includes('seated_friendly')
  if (rules.length === 0) return { factor: seated ? 1.1 : 1, standingOk: true, missingEquipment: [] }
  let standingOk = true
  let seatedPreferred = false
  const missing = new Set<Equipment>()
  for (const r of rules) {
    const p = r.payload as PrepPayload
    if (p.maxStandingMinutes !== undefined && (recipe.standingMinutes ?? 0) > p.maxStandingMinutes) standingOk = false
    if (p.maxActiveMinutes !== undefined && (recipe.activeMinutes ?? 0) > p.maxActiveMinutes) standingOk = false
    if (p.seatedPreferred) seatedPreferred = true
    if (p.equipment && p.equipment.length) {
      for (const e of recipe.equipment) if (!p.equipment.includes(e)) missing.add(e)
    }
  }
  const factor = standingOk && (seatedPreferred || seated) ? 1.1 : 1
  return { factor, standingOk, missingEquipment: [...missing] }
}

/** Flags when a serving breaks a diet rule. */
export function dietFlags(nutrition: Nutrition | null, ctx: RuleContext): DietFlag[] {
  if (!nutrition) return []
  const out: DietFlag[] = []
  for (const r of activeRules(ctx, 'diet')) {
    const p = r.payload as DietPayload
    const who = personName(ctx, r.appliesToPersonId)
    const suffix = who ? ` (${who}'s rule)` : ''
    if (p.sodiumMaxMg !== undefined && nutrition.sodiumMg > p.sodiumMaxMg) out.push({ kind: 'sodium_over', value: nutrition.sodiumMg, limit: p.sodiumMaxMg, text: `Sodium ${Math.round(nutrition.sodiumMg)} mg, over the ${p.sodiumMaxMg} mg cap${suffix}` })
    if (p.proteinMinG !== undefined && nutrition.proteinG < p.proteinMinG) out.push({ kind: 'protein_under', value: nutrition.proteinG, limit: p.proteinMinG, text: `Protein ${Math.round(nutrition.proteinG)} g, under the ${p.proteinMinG} g floor${suffix}` })
    if (p.caloriesMax !== undefined && nutrition.calories > p.caloriesMax) out.push({ kind: 'calories_over', value: nutrition.calories, limit: p.caloriesMax, text: `${Math.round(nutrition.calories)} kcal, over the ${p.caloriesMax} cap${suffix}` })
    if (p.caloriesMin !== undefined && nutrition.calories < p.caloriesMin) out.push({ kind: 'calories_under', value: nutrition.calories, limit: p.caloriesMin, text: `${Math.round(nutrition.calories)} kcal, under the ${p.caloriesMin} floor${suffix}` })
  }
  return out
}

/** Energy gate: little allows effort <= 2, some <= 3.5, plenty everything. Null effort passes. */
export function energyAllows(effortScore: number | null, energy: Energy | null | undefined): boolean {
  if (effortScore === null || effortScore === undefined || !energy) return true
  if (energy === 'little') return effortScore <= 2
  if (energy === 'some') return effortScore <= 3.5
  return true
}

/** Plain-language rule text for the rules editor. */
export function describeRule(rule: Rule, ctx: RuleContext): string {
  const who = personName(ctx, rule.appliesToPersonId)
  if (rule.type === 'allergy') {
    const p = rule.payload as AllergyPayload
    const subject = who ?? 'Nobody here'
    const verb = p.severity === 'severe' ? 'is allergic to' : p.severity === 'dislike' ? "doesn't like" : "can't have"
    const base = who ? `${subject} ${verb} ${p.ingredient ?? '?'}.` : `No ${p.ingredient ?? '?'} for anyone.`
    return p.substitute ? `${base} Swap in ${p.substitute}.` : base
  }
  if (rule.type === 'prep') {
    const p = rule.payload as PrepPayload
    const parts: string[] = []
    if (p.seatedPreferred) parts.push('Seated prep')
    if (p.maxStandingMinutes !== undefined) parts.push(`under ${p.maxStandingMinutes} minutes standing`)
    if (p.maxActiveMinutes !== undefined) parts.push(`under ${p.maxActiveMinutes} active minutes`)
    const head = parts.length ? parts.join(', ') : 'Prep rule'
    const eq = p.equipment && p.equipment.length ? ` Equipment: ${p.equipment.map(equipmentLabel).join(', ')}.` : ''
    return `${head}${who ? ` for ${who}` : ''}.${eq}`.replace(/\.\./g, '.')
  }
  if (rule.type === 'diet') {
    const p = rule.payload as DietPayload
    const parts: string[] = []
    if (p.sodiumMaxMg !== undefined) parts.push(`Sodium under ${p.sodiumMaxMg} mg a serving`)
    if (p.proteinMinG !== undefined) parts.push(`at least ${p.proteinMinG} g protein`)
    if (p.caloriesMax !== undefined) parts.push(`under ${p.caloriesMax} kcal`)
    if (p.caloriesMin !== undefined) parts.push(`at least ${p.caloriesMin} kcal`)
    const text = parts.length ? parts.join(', ') : 'Diet rule'
    return `${text}${who ? ` for ${who}` : ''}.`
  }
  const p = rule.payload as CuisinePayload
  const w = p.weight === 'liked' ? 'Likes' : p.weight === 'avoid' ? 'Avoids' : 'Tolerates'
  return `${w} ${p.cuisine ?? '?'}.`
}

export function equipmentLabel(e: Equipment): string {
  const map: Record<Equipment, string> = {
    crockpot: 'crockpot', oven: 'oven', stovetop: 'stovetop', grill: 'grill', microwave: 'microwave', air_fryer: 'air fryer', instant_pot: 'Instant Pot',
    sheet_pan: 'sheet pan', blender: 'blender', souper_cubes: 'Souper Cubes', ninja_woodfire: 'Ninja Woodfire',
  }
  return map[e] ?? e
}
