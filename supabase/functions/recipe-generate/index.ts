// Supabase Edge Function: "Make me a recipe" (spec, Recipes: AI recipe generation).
//
// Input (as the signed-in user): { householdId, request }. The function loads what the household has in stock (item
// names with OK or Low status, or a count above 0) and its active rules (allergies, prep limits, diet targets, cuisine
// likes), hands those plus the request to the model, and returns one recipe in the shared shape (_shared/recipe.ts).
// Before answering it runs the ingredients through public.check_allergies as the user, so an ingredient that trips a
// household allergy rule comes back flagged in `allergyHits` and the recipe is marked `status: 'draft'` for review.
// Output: { recipe, allergyHits: [{ ingredient, severity, substitute, personId }], via: 'model' }. Nothing is written
// except the ai_usage row; the app saves the recipe through its own mutations so undo works.
//
// Caps: INTAKE_GENERATE_MAX_PER_DAY calls per household per day (default 20), fn 'recipe-generate' in ai_usage.
// Secrets: ANTHROPIC_API_KEY (required), INTAKE_MODEL (optional).
import { json, preflight, readBody } from '../_shared/http.ts'
import { authenticate, readEnv } from '../_shared/auth.ts'
import { capMessage, recordUsage, remainingToday } from '../_shared/usage.ts'
import { asArray, asObject, asString, askModel, dailyCap, dataBlock, extractJson, modelFromEnv } from '../_shared/model.ts'
import { cleanRecipe, RECIPE_SHAPE } from '../_shared/recipe.ts'

const FN = 'recipe-generate'
const MAX_PER_DAY = dailyCap('INTAKE_GENERATE_MAX_PER_DAY', 20)

const SYSTEM = `You write one practical home recipe for a household that cooks in batches, freezes portions, and sometimes cooks from a chair.
Answer with ${RECIPE_SHAPE}
Rules: prefer ingredients the household has in stock, but add what the dish needs. Obey every household rule given: never use an allergy ingredient or anything made from it; stay inside the standing-time and active-time limits; respect diet targets. Keep steps short, one action each. Give realistic activeMinutes, standingMinutes and totalMinutes. Mark freezer_safe when the dish freezes well and seated_friendly when most steps can be done sitting down.`

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  const env = readEnv()
  if (env instanceof Response) return env
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'Recipe ideas are not set up. Add ANTHROPIC_API_KEY to the function secrets.' }, 503)

  const body = await readBody<{ householdId?: string; request?: string }>(req)
  const caller = await authenticate(req, env, body.householdId)
  if (caller instanceof Response) return caller
  const request = asString(body.request, 600)
  if (!request) return json({ error: 'Say what you want, like "cheap crockpot dinner for 6 with chicken thighs".' }, 400)
  if ((await remainingToday(caller.admin, caller.householdId, FN, MAX_PER_DAY)) <= 0) return json({ error: capMessage(FN, MAX_PER_DAY) }, 429)

  const [{ data: items }, { data: rules }, { data: persons }] = await Promise.all([
    caller.admin.from('items').select('name, track_mode, status, qty, category').eq('household_id', caller.householdId).is('deleted_at', null).order('name').limit(400),
    caller.admin.from('rules').select('type, payload, applies_to_person_id').eq('household_id', caller.householdId).eq('active', true).is('deleted_at', null),
    caller.admin.from('persons').select('id, name').eq('household_id', caller.householdId).is('deleted_at', null),
  ])
  const NON_FOOD = new Set(['cleaning', 'paper', 'pet', 'pharmacy', 'personal', 'household'])
  const inStock = asArray(items)
    .map((r) => asObject(r))
    .filter((i) => !NON_FOOD.has(String(i.category)) && (i.track_mode === 'count' ? Number(i.qty ?? 0) > 0 : i.status !== 'out'))
    .map((i) => String(i.name))
  const personName = (id: unknown) => asArray(persons).map((p) => asObject(p)).find((p) => p.id === id)?.name ?? null
  const ruleLines = asArray(rules).map((r) => {
    const o = asObject(r)
    const p = asObject(o.payload)
    const who = personName(o.applies_to_person_id)
    const scope = who ? ` (for ${who})` : ''
    switch (o.type) {
      case 'allergy':
        return `Never use ${p.ingredient}${p.substitute ? `; use ${p.substitute} instead` : ''} (${p.severity ?? 'avoid'})${scope}.`
      case 'prep':
        return `Prep limits${scope}: ${[p.maxStandingMinutes ? `standing at most ${p.maxStandingMinutes} min` : null, p.maxActiveMinutes ? `active at most ${p.maxActiveMinutes} min` : null, p.seatedPreferred ? 'prefer steps that can be done seated' : null, Array.isArray(p.equipment) && p.equipment.length ? `equipment available: ${p.equipment.join(', ')}` : null].filter(Boolean).join('; ') || 'none'}.`
      case 'diet':
        return `Diet${scope}: ${[p.sodiumMaxMg ? `sodium under ${p.sodiumMaxMg} mg per serving` : null, p.proteinMinG ? `protein at least ${p.proteinMinG} g per serving` : null, p.caloriesMax ? `under ${p.caloriesMax} kcal per serving` : null].filter(Boolean).join('; ') || 'none'}.`
      case 'cuisine':
        return `Cuisine ${p.cuisine}: ${p.weight}${scope}.`
      default:
        return null
    }
  }).filter((s): s is string => !!s)

  const content = [
    { type: 'text' as const, text: `Household rules:\n${ruleLines.length ? ruleLines.map((l) => `- ${l}`).join('\n') : '- none'}\n\nIn stock now: ${inStock.length ? inStock.join(', ') : 'nothing recorded'}` },
    { type: 'text' as const, text: dataBlock('request', request) },
  ]
  let answer
  try {
    answer = await askModel({ apiKey, model: modelFromEnv(), system: SYSTEM, content, maxTokens: 4000, effort: 'medium' })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
  await recordUsage(caller.admin, caller.householdId, caller.userId, FN, answer)
  const recipe = cleanRecipe(extractJson(answer.text), null)
  if (!recipe) return json({ error: 'No recipe came back. Try saying it another way.' }, 422)

  // Allergy check as the user (security invoker): the same rule the app applies, run on the server before the preview.
  const { data: hits, error: hitErr } = await caller.asUser.rpc('check_allergies', { p_household_id: caller.householdId, p_ingredients: recipe.ingredients.map((i) => i.ingredientName) })
  const allergyHits = hitErr
    ? []
    : asArray(hits).map((h) => {
        const o = asObject(h)
        return { ingredient: String(o.ingredient ?? ''), severity: String(o.severity ?? 'avoid'), substitute: asString(o.substitute, 80), personId: asString(o.person_id, 40) }
      })
  return json({ recipe, allergyHits, via: 'model', checkError: hitErr ? hitErr.message : null })
})
