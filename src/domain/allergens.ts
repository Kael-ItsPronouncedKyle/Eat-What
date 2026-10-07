/* Allergen families: a rule for "nuts" covers almonds, walnuts, and so on.
   Pure string work on canonical names (see names.ts). The same table is seeded into
   app.allergen_aliases by supabase/migrations/0005_allergy_aliases.sql; keep both in step. */
import { canonicalName, containsIngredient } from './names'

/** Family name (as a cook would type it) -> member terms. Each term is matched as a whole word or phrase.
    Keys and terms are stored in plain English; everything is canonicalized before matching, so plurals
    ("nuts", "eggs") and descriptors ("fresh", "whole") do not matter. */
export const ALLERGEN_FAMILIES: Readonly<Record<string, readonly string[]>> = {
  nuts: ['almond', 'walnut', 'pecan', 'cashew', 'pistachio', 'hazelnut', 'macadamia', 'pine nut', 'peanut'],
  'tree nuts': ['almond', 'walnut', 'pecan', 'cashew', 'pistachio', 'hazelnut', 'macadamia', 'pine nut'],
  peanuts: ['peanut'],
  shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'crawfish', 'scallop', 'clam', 'mussel', 'oyster'],
  dairy: ['milk', 'cheese', 'butter', 'cream', 'half and half', 'yogurt', 'whey', 'ghee', 'cheddar', 'mozzarella', 'parmesan', 'feta'],
  gluten: ['wheat', 'flour', 'all-purpose flour', 'bread flour', 'cake flour', 'bread', 'pasta', 'couscous', 'barley', 'rye', 'seitan', 'soy sauce'],
  wheat: ['wheat', 'flour', 'all-purpose flour', 'bread flour', 'cake flour', 'bread', 'pasta', 'couscous', 'barley', 'rye', 'seitan', 'soy sauce'],
  eggs: ['egg', 'mayonnaise'],
  soy: ['soy', 'soy sauce', 'tofu', 'edamame', 'tempeh', 'miso'],
  sesame: ['sesame', 'tahini'],
  fish: ['fish', 'salmon', 'tuna', 'cod', 'tilapia', 'anchovy', 'fish sauce'],
}

/** Ingredients that contain a family term as a whole word but are not that allergen.
    Keyed by the term, listing the ingredient phrases that term must not flag.
    Single-word look-alikes (coconut, eggplant, nutmeg, buckwheat, butternut) need no entry:
    whole-word matching already keeps "nut" out of "coconut" and "egg" out of "eggplant". */
export const ALLERGEN_EXCEPTIONS: Readonly<Record<string, readonly string[]>> = {
  milk: ['coconut milk', 'almond milk', 'oat milk', 'soy milk', 'rice milk', 'cashew milk', 'milk of magnesia'],
  cream: ['coconut cream', 'cream of tartar', 'cashew cream'],
  butter: ['peanut butter', 'almond butter', 'cashew butter', 'sunflower butter', 'cocoa butter', 'apple butter'],
  cheese: ['vegan cheese'],
  nut: ['water chestnut'],
  oyster: ['oyster mushroom'],
  crab: ['crab apple'],
  fish: ['oyster mushroom'],
}

const familyIndex = new Map<string, readonly string[]>()
for (const [family, terms] of Object.entries(ALLERGEN_FAMILIES)) familyIndex.set(canonicalName(family), terms)

const exceptionIndex = new Map<string, string[]>()
for (const [term, phrases] of Object.entries(ALLERGEN_EXCEPTIONS)) exceptionIndex.set(canonicalName(term), phrases.map(canonicalName))

/** Canonical terms a rule for `name` covers: the name itself first, then its family members (deduped).
    Unknown names return just themselves, so a rule for "cilantro" still works. */
export function expandAllergen(name: string): string[] {
  const self = canonicalName(name)
  if (!self) return []
  const out = [self]
  for (const t of familyIndex.get(self) ?? []) {
    const c = canonicalName(t)
    if (c && !out.includes(c)) out.push(c)
  }
  return out
}

/** Does the ingredient contain `term` as a whole word or phrase, and not only inside one of the term's exceptions? */
function hasTerm(canonicalIngredient: string, term: string): boolean {
  if (!containsIngredient(canonicalIngredient, term)) return false
  const excepted = exceptionIndex.get(term)
  if (!excepted) return true
  // Only skip when the match is explained entirely by exception phrases: "coconut milk" is not dairy,
  // but "coconut milk and milk" still is. Blank out each exception phrase and look again.
  let rest = ` ${canonicalIngredient} `
  for (const phrase of excepted) rest = rest.split(` ${phrase} `).join('  ')
  return containsIngredient(rest.trim(), term)
}

/** True when `ingredientName` is, or contains, the allergen or any member of its family (whole words only). */
export function ingredientHasAllergen(ingredientName: string, allergen: string): boolean {
  const hay = canonicalName(ingredientName)
  if (!hay) return false
  for (const term of expandAllergen(allergen)) if (hasTerm(hay, term)) return true
  return false
}

/** The family names the app knows, for pickers and the partner. */
export const ALLERGEN_FAMILY_NAMES: readonly string[] = Object.keys(ALLERGEN_FAMILIES)
