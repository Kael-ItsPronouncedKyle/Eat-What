// The recipe shape url-import and recipe-generate both answer with. It mirrors Recipe + RecipeIngredient in
// src/domain/types.ts closely enough that the app's saveRecipe takes it with no extra mapping.
import { asArray, asNumber, asObject, asString } from './model.ts'

export interface RecipeOut {
  title: string
  description: string | null
  cuisine: string | null
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'side' | 'dessert' | 'component' | null
  baseYield: number
  yieldUnit: string
  ingredients: { ingredientName: string; amount: number | null; unit: string | null; preparation: string | null; optional: boolean }[]
  steps: { text: string; timerMinutes?: number }[]
  activeMinutes: number | null
  standingMinutes: number | null
  totalMinutes: number | null
  equipment: string[]
  tags: string[]
  sourceUrl: string | null
}

const MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack', 'side', 'dessert', 'component'])
const EQUIPMENT = new Set(['crockpot', 'oven', 'stovetop', 'grill', 'microwave', 'air_fryer', 'instant_pot', 'sheet_pan', 'blender', 'souper_cubes', 'ninja_woodfire'])
const YIELD_UNITS = new Set(['servings', 'cups', 'quarts', 'pints', 'liters', 'ml'])
const TAGS = new Set(['one_pot', 'no_chop', 'sheet_pan', 'freezer_safe', 'cook_from_frozen', 'microwave_only', 'dump_kit', 'seated_friendly', 'crockpot', 'grill'])

/** The JSON shape the prompts ask for, spelled out once so both functions say the same thing. */
export const RECIPE_SHAPE = `{
  "title": string,
  "description": string | null,
  "cuisine": string | null,
  "mealType": "breakfast" | "lunch" | "dinner" | "snack" | "side" | "dessert" | "component" | null,
  "baseYield": number,
  "yieldUnit": "servings" | "cups" | "quarts" | "pints" | "liters" | "ml",
  "ingredients": [{ "ingredientName": string, "amount": number | null, "unit": string | null, "preparation": string | null, "optional": boolean }],
  "steps": [{ "text": string, "timerMinutes": number | null }],
  "activeMinutes": number | null,
  "standingMinutes": number | null,
  "totalMinutes": number | null,
  "equipment": ("crockpot" | "oven" | "stovetop" | "grill" | "microwave" | "air_fryer" | "instant_pot" | "sheet_pan" | "blender")[],
  "tags": ("one_pot" | "no_chop" | "sheet_pan" | "freezer_safe" | "cook_from_frozen" | "microwave_only" | "dump_kit" | "seated_friendly" | "crockpot" | "grill")[]
}
Units are short and lowercase ("cup", "tbsp", "tsp", "oz", "lb", "g", "can", "clove"). "amount" is a number (use 0.5 for 1/2). Leave a field null when the source does not say; never invent times or amounts.`

/** Validate and clean whatever came back. Returns null when there is no usable title or no ingredients. */
export function cleanRecipe(raw: unknown, sourceUrl: string | null): RecipeOut | null {
  const o = asObject(raw)
  const title = asString(o.title, 160)
  if (!title) return null
  const ingredients = asArray(o.ingredients)
    .map((x) => {
      const i = asObject(x)
      const name = asString(i.ingredientName ?? i.name, 120)
      if (!name) return null
      return {
        ingredientName: name,
        amount: asNumber(i.amount),
        unit: asString(i.unit, 24)?.toLowerCase() ?? null,
        preparation: asString(i.preparation, 120),
        optional: i.optional === true,
      }
    })
    .filter((x): x is RecipeOut['ingredients'][number] => x !== null)
    .slice(0, 60)
  if (ingredients.length === 0) return null
  const steps = asArray(o.steps)
    .map((x) => {
      const text = typeof x === 'string' ? asString(x, 2000) : asString(asObject(x).text, 2000)
      if (!text) return null
      const timer = typeof x === 'string' ? null : asNumber(asObject(x).timerMinutes)
      return timer && timer > 0 ? { text, timerMinutes: Math.round(timer) } : { text }
    })
    .filter((x): x is RecipeOut['steps'][number] => x !== null)
    .slice(0, 60)
  const mealType = asString(o.mealType, 20)?.toLowerCase() ?? null
  const yieldN = asNumber(o.baseYield)
  const yieldUnit = asString(o.yieldUnit, 20)?.toLowerCase() ?? 'servings'
  const minutes = (v: unknown) => {
    const n = asNumber(v)
    return n !== null && n >= 0 ? Math.round(n) : null
  }
  return {
    title,
    description: asString(o.description, 1000),
    cuisine: asString(o.cuisine, 60),
    mealType: mealType && MEAL_TYPES.has(mealType) ? (mealType as RecipeOut['mealType']) : null,
    baseYield: yieldN && yieldN > 0 ? yieldN : 4,
    yieldUnit: YIELD_UNITS.has(yieldUnit) ? yieldUnit : 'servings',
    ingredients,
    steps,
    activeMinutes: minutes(o.activeMinutes),
    standingMinutes: minutes(o.standingMinutes),
    totalMinutes: minutes(o.totalMinutes),
    equipment: asArray(o.equipment).map((e) => String(e).toLowerCase()).filter((e) => EQUIPMENT.has(e)),
    tags: asArray(o.tags).map((t) => String(t).toLowerCase()).filter((t) => TAGS.has(t)),
    sourceUrl,
  }
}
