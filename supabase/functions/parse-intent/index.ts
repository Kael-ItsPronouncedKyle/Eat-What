// Supabase Edge Function: the partner's server-side intent parser (spec, AI partner and voice).
//
// Input (as the signed-in user): { householdId, utterance, today? }. The function builds the context packet itself from
// the database (item names, retailer names, person names, recipe titles) so the model can map "the thighs" to the item
// the household actually has. Output: { intents: Intent[], via: 'server' } in the exact Intent union the app's local
// parser (src/features/partner/intents.ts) returns, so the confirm sheet needs no change. The utterance is data, never
// an instruction. Nothing is written except the ai_usage row.
//
// Caps: INTAKE_PARSE_MAX_PER_DAY calls per household per day (default 200), fn 'parse-intent' in ai_usage.
// Secrets: ANTHROPIC_API_KEY (required), INTAKE_MODEL (optional).
import { json, preflight, readBody } from '../_shared/http.ts'
import { authenticate, readEnv } from '../_shared/auth.ts'
import { capMessage, recordUsage, remainingToday } from '../_shared/usage.ts'
import { asArray, asNumber, asObject, asString, askModel, dailyCap, dataBlock, extractJson, modelFromEnv } from '../_shared/model.ts'

const FN = 'parse-intent'
const MAX_PER_DAY = dailyCap('INTAKE_PARSE_MAX_PER_DAY', 200)

const SYSTEM = `You turn one short request from a household member into structured intents for a pantry and meal app.
Answer with {"intents": Intent[]} where Intent is one of:
- {"kind":"inventory.add","confidence":n,"items":[{"name":s,"qty"?:n,"unit"?:s,"location"?:s,"category"?:s}]}  (they got or restocked something)
- {"kind":"inventory.set_status","confidence":n,"items":[{"name":s,"status":"ok"|"low"|"out"}]}  (out of, low on, back in stock)
- {"kind":"inventory.consume","confidence":n,"items":[{"name":s,"qty"?:n,"unit"?:s}]}  (used, ate, finished some)
- {"kind":"inventory.query","confidence":n,"query":s,"itemNames"?:[s]}  (do we have, how much, what's low, what's expiring)
- {"kind":"recipe.suggest","confidence":n,"filters"?:{"mealType"?:s,"cheapest"?:b,"maxActiveMinutes"?:n,"seatedFriendly"?:b,"freezerSafe"?:b,"equipment"?:[s]}}  (what can I make)
- {"kind":"recipe.generate","confidence":n,"brief":s}  (make me a recipe for ...)
- {"kind":"list.add","confidence":n,"items":[{"name":s,"qty"?:n,"unit"?:s,"retailer"?:s}]}  (add to the list, we need to buy)
- {"kind":"list.route","confidence":n,"itemName":s,"retailer":s,"always"?:b}
- {"kind":"list.send","confidence":n,"retailer"?:s}
- {"kind":"plan.set","confidence":n,"date":"YYYY-MM-DD","slot"?:"dinner"|"lunch"|"breakfast","recipeTitle"?:s,"person"?:s,"note"?:s}
- {"kind":"plan.cookweek","confidence":n,"batches"?:n,"budgetCents"?:n,"constraints"?:s}
- {"kind":"rules.edit","confidence":n,"rule":{"type":"allergy","ingredient":s,"severity":"avoid"|"dislike"|"severe"},"person"?:s}
- {"kind":"unknown","confidence":n,"clarify":s}  (one short clarifying question)
Rules: confidence is 0 to 1. Use the household's own item names from the context when the request clearly means one of them, otherwise keep the words as spoken, lower-case and without filler. Split "out of eggs and low on butter" into one set_status intent with two items. Category, when given, is one of produce, dairy, meat, seafood, pantry, frozen, bakery, beverage, spice, condiment, cleaning, paper, pet, pharmacy, personal, household, other. Never invent quantities. When unsure, answer unknown with a plain clarifying question.`

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  const env = readEnv()
  if (env instanceof Response) return env
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'The server parser is not set up. Add ANTHROPIC_API_KEY to the function secrets.' }, 503)

  const body = await readBody<{ householdId?: string; utterance?: string; today?: string }>(req)
  const caller = await authenticate(req, env, body.householdId, ['owner', 'editor', 'agent', 'viewer'])
  if (caller instanceof Response) return caller
  const utterance = asString(body.utterance, 600)
  if (!utterance) return json({ error: 'Say or type something first.' }, 400)
  const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today ?? '') ? body.today! : new Date().toISOString().slice(0, 10)

  if ((await remainingToday(caller.admin, caller.householdId, FN, MAX_PER_DAY)) <= 0) return json({ error: capMessage(FN, MAX_PER_DAY) }, 429)

  const [items, retailers, persons, recipes] = await Promise.all([
    caller.admin.from('items').select('name').eq('household_id', caller.householdId).is('deleted_at', null).order('name').limit(400),
    caller.admin.from('retailers').select('name').eq('household_id', caller.householdId).is('deleted_at', null).limit(20),
    caller.admin.from('persons').select('name').eq('household_id', caller.householdId).is('deleted_at', null).limit(20),
    caller.admin.from('recipes').select('title').eq('household_id', caller.householdId).is('deleted_at', null).neq('status', 'archived').limit(300),
  ])
  const names = (rows: { data: unknown } | null, key: string) => asArray(rows?.data).map((r) => asString(asObject(r)[key], 80)).filter((s): s is string => !!s)
  const packet = {
    today,
    items: names(items, 'name'),
    retailers: names(retailers, 'name'),
    persons: names(persons, 'name'),
    recipes: names(recipes, 'title'),
  }

  const content = [
    { type: 'text' as const, text: `Household context (names only, for matching):\n${JSON.stringify(packet)}` },
    { type: 'text' as const, text: dataBlock('utterance', utterance) },
  ]
  let answer
  try {
    answer = await askModel({ apiKey, model: modelFromEnv(), system: SYSTEM, content, maxTokens: 1500, effort: 'low' })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
  await recordUsage(caller.admin, caller.householdId, caller.userId, FN, answer)
  const intents = cleanIntents(extractJson(answer.text))
  if (intents.length === 0) return json({ error: 'The server did not understand that. The app will try its own parser.' }, 422)
  return json({ intents, via: 'server' })
})

const KINDS = new Set([
  'inventory.add', 'inventory.set_status', 'inventory.consume', 'inventory.query', 'recipe.suggest', 'recipe.generate',
  'plan.set', 'plan.cookweek', 'list.add', 'list.route', 'list.send', 'rules.edit', 'cook.navigate', 'unknown',
])
const STATUSES = new Set(['ok', 'low', 'out'])

/** Keep only well-formed intents; drop anything the app's union does not know. */
function cleanIntents(raw: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const x of asArray(asObject(raw).intents).slice(0, 10)) {
    const o = asObject(x)
    const kind = asString(o.kind, 40)
    if (!kind || !KINDS.has(kind)) continue
    const c = asNumber(o.confidence)
    const confidence = c === null ? 0.5 : Math.min(1, Math.max(0, c))
    const items = asArray(o.items)
      .map((it) => {
        const i = asObject(it)
        const name = asString(i.name, 80)?.toLowerCase()
        if (!name) return null
        const row: Record<string, unknown> = { name }
        const qty = asNumber(i.qty)
        if (qty !== null && qty > 0) row.qty = qty
        const unit = asString(i.unit, 20)
        if (unit) row.unit = unit.toLowerCase()
        const status = asString(i.status, 10)?.toLowerCase()
        if (status && STATUSES.has(status)) row.status = status
        const location = asString(i.location, 40)
        if (location) row.location = location.toLowerCase()
        const category = asString(i.category, 20)
        if (category) row.category = category.toLowerCase()
        const retailer = asString(i.retailer, 40)
        if (retailer) row.retailer = retailer
        return row
      })
      .filter((r): r is Record<string, unknown> => r !== null)
    switch (kind) {
      case 'inventory.add':
      case 'inventory.consume':
      case 'list.add':
        if (items.length) out.push({ kind, confidence, items })
        break
      case 'inventory.set_status': {
        const withStatus = items.filter((i) => typeof i.status === 'string')
        if (withStatus.length) out.push({ kind, confidence, items: withStatus })
        break
      }
      case 'inventory.query': {
        const names = asArray(o.itemNames).map((n) => asString(n, 80)?.toLowerCase()).filter((n): n is string => !!n)
        out.push(names.length ? { kind, confidence, query: asString(o.query, 40) ?? 'items', itemNames: names } : { kind, confidence, query: asString(o.query, 40) ?? 'all' })
        break
      }
      case 'recipe.suggest':
        out.push(o.filters && typeof o.filters === 'object' ? { kind, confidence, filters: asObject(o.filters) } : { kind, confidence })
        break
      case 'recipe.generate': {
        const brief = asString(o.brief, 400)
        if (brief) out.push({ kind, confidence, brief })
        break
      }
      case 'unknown':
        out.push({ kind, confidence, clarify: asString(o.clarify, 200) ?? 'I did not catch that. Try "we\'re out of eggs".' })
        break
      default: {
        // The less common kinds pass through with their own fields, minus anything that is not a plain value.
        const rest: Record<string, unknown> = { kind, confidence }
        for (const [k, v] of Object.entries(o)) if (k !== 'kind' && k !== 'confidence' && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || (v && typeof v === 'object'))) rest[k] = v
        out.push(rest)
      }
    }
  }
  return out
}
