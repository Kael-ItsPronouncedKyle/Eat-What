import type { Energy, Equipment, Nutrition, Person, Recipe, RecipeIngredient, Rule } from './types'

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

/** Allergy rows that match the ingredients (by canonical containment), optionally for one person only. */
export function allergyViolations(_ingredients: RecipeIngredient[], _ctx: RuleContext, _personId?: string | null): AllergyViolation[] {
  throw new Error('not implemented: allergyViolations')
}

/** Rewrite violating ingredients with the rule's substitute when one exists; return the rest as unresolved. */
export function applySubstitutions(_ingredients: RecipeIngredient[], _ctx: RuleContext): { ingredients: RecipeIngredient[]; substitutions: Substitution[]; unresolved: AllergyViolation[] } {
  throw new Error('not implemented: applySubstitutions')
}

/** liked 1.2, tolerated 1.0, avoid 0.6, unknown 1.0. Case-insensitive on cuisine. */
export function cuisineWeight(_cuisine: string | null, _ctx: RuleContext): number {
  throw new Error('not implemented: cuisineWeight')
}

export interface PrepFit {
  /** 1.1 when the recipe's standing minutes fit the household max (or no max is set and the recipe is seated_friendly); else 1.0. */
  factor: number
  standingOk: boolean
  missingEquipment: Equipment[]
}

export function prepFit(_recipe: Recipe, _ctx: RuleContext): PrepFit {
  throw new Error('not implemented: prepFit')
}

/** Flags when a serving breaks a diet rule. */
export function dietFlags(_nutrition: Nutrition | null, _ctx: RuleContext): DietFlag[] {
  throw new Error('not implemented: dietFlags')
}

/** Energy gate: little allows effort <= 2, some <= 3.5, plenty everything. Null effort passes. */
export function energyAllows(_effortScore: number | null, _energy: Energy | null | undefined): boolean {
  throw new Error('not implemented: energyAllows')
}

/** Plain-language rule text for the rules editor ("Sarah can't have coconut; swap lime juice"). */
export function describeRule(_rule: Rule, _ctx: RuleContext): string {
  throw new Error('not implemented: describeRule')
}
