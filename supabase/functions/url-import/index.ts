// Supabase Edge Function: import a recipe from a web page (spec, Recipes: "paste a link").
//
// Input (as the signed-in user): { householdId, url }. The page is fetched server side (http or https only, public
// hosts, 2 MB cap, 15 s timeout). When the page carries JSON-LD of @type Recipe, that is used directly and no model
// call is made. Otherwise the visible text is handed to the model inside a DATA block and it extracts title, yield,
// ingredients with amounts and units, steps and times in the shared recipe shape (_shared/recipe.ts).
// Output: { recipe, via: 'jsonld' | 'model' }. Nothing is written except the ai_usage row for model calls.
//
// Caps: INTAKE_IMPORT_MAX_PER_DAY model calls per household per day (default 40), fn 'url-import' in ai_usage.
// Secrets: ANTHROPIC_API_KEY (needed only for pages without JSON-LD), INTAKE_MODEL (optional).
import { json, preflight, readBody } from '../_shared/http.ts'
import { authenticate, readEnv } from '../_shared/auth.ts'
import { capMessage, recordUsage, remainingToday } from '../_shared/usage.ts'
import { asArray, asNumber, asObject, asString, askModel, dailyCap, dataBlock, extractJson, modelFromEnv } from '../_shared/model.ts'
import { cleanRecipe, RECIPE_SHAPE, type RecipeOut } from '../_shared/recipe.ts'

const FN = 'url-import'
const MAX_PER_DAY = dailyCap('INTAKE_IMPORT_MAX_PER_DAY', 40)
const MAX_BYTES = 2_000_000
const MAX_TEXT_CHARS = 60_000

const SYSTEM = `You extract one recipe from the visible text of a web page for a home cooking app.
Answer with ${RECIPE_SHAPE}
Only report what the page says. If the page has no recipe, answer {"title": null}.`

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  const env = readEnv()
  if (env instanceof Response) return env
  const body = await readBody<{ householdId?: string; url?: string }>(req)
  const caller = await authenticate(req, env, body.householdId)
  if (caller instanceof Response) return caller

  const url = safeUrl(body.url)
  if (!url) return json({ error: 'That does not look like a web link. Paste the full address, starting with https://' }, 400)

  let html: string
  try {
    html = await fetchPage(url)
  } catch (e) {
    return json({ error: `Could not open that page: ${e instanceof Error ? e.message : String(e)}` }, 422)
  }

  const fromJsonLd = extractJsonLdRecipe(html, url.toString())
  if (fromJsonLd) return json({ recipe: fromJsonLd, via: 'jsonld' })

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'That page has no recipe data the app can read, and the model import is not set up (ANTHROPIC_API_KEY).' }, 503)
  if ((await remainingToday(caller.admin, caller.householdId, FN, MAX_PER_DAY)) <= 0) return json({ error: capMessage(FN, MAX_PER_DAY) }, 429)

  const text = visibleText(html).slice(0, MAX_TEXT_CHARS)
  if (text.length < 80) return json({ error: 'That page has almost no text to read. Try the printable version of the recipe.' }, 422)
  let answer
  try {
    answer = await askModel({ apiKey, model: modelFromEnv(), system: SYSTEM, content: [{ type: 'text', text: dataBlock(`page ${url.hostname}`, text) }], maxTokens: 4000, effort: 'medium' })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
  await recordUsage(caller.admin, caller.householdId, caller.userId, FN, answer)
  const recipe = cleanRecipe(extractJson(answer.text), url.toString())
  if (!recipe) return json({ error: 'No recipe found on that page.' }, 422)
  return json({ recipe, via: 'model' })
})

/* ------------------------------------------------------------------------------------------------
   Fetching: public http(s) only, so the function cannot be pointed at the project's own network.
   ------------------------------------------------------------------------------------------------ */

function safeUrl(raw: unknown): URL | null {
  const s = asString(raw, 2000)
  if (!s) return null
  let u: URL
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase()
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return null
  if (/^(\d+\.){3}\d+$/.test(host) || host.startsWith('[')) return null
  u.hash = ''
  return u
}

async function fetchPage(url: URL): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QuartermasterRecipeImport/1.0)', Accept: 'text/html,application/xhtml+xml' },
    })
    if (!res.ok) throw new Error(`the site answered ${res.status}`)
    // A redirect may land somewhere the first check did not see (an internal host); apply the same rules to where it ended up.
    if (res.url && !safeUrl(res.url)) throw new Error('that link redirects somewhere the app cannot read')
    const type = res.headers.get('content-type') ?? ''
    if (type && !/html|xml|text\/plain/i.test(type)) throw new Error('that link is not a web page')
    const reader = res.body?.getReader()
    if (!reader) return await res.text()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.byteLength
        chunks.push(value)
        if (total > MAX_BYTES) {
          await reader.cancel()
          break
        }
      }
    }
    const merged = new Uint8Array(total)
    let offset = 0
    for (const c of chunks) {
      merged.set(c, offset)
      offset += c.byteLength
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(merged)
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------------------------------------------------------------------------
   JSON-LD Recipe (schema.org): most recipe sites carry one, so no model call is needed.
   ------------------------------------------------------------------------------------------------ */

export function extractJsonLdRecipe(html: string, sourceUrl: string): RecipeOut | null {
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    let parsed: unknown
    try {
      parsed = JSON.parse(decodeEntities(m[1] ?? '').trim())
    } catch {
      continue
    }
    const node = findRecipeNode(parsed)
    if (node) {
      const recipe = jsonLdToRecipe(node, sourceUrl)
      if (recipe) return recipe
    }
  }
  return null
}

function findRecipeNode(v: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 6 || !v) return null
  if (Array.isArray(v)) {
    for (const x of v) {
      const r = findRecipeNode(x, depth + 1)
      if (r) return r
    }
    return null
  }
  if (typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const types = Array.isArray(o['@type']) ? o['@type'].map(String) : [String(o['@type'] ?? '')]
  if (types.some((t) => t.toLowerCase() === 'recipe')) return o
  if (o['@graph']) return findRecipeNode(o['@graph'], depth + 1)
  if (o.mainEntity) return findRecipeNode(o.mainEntity, depth + 1)
  return null
}

function jsonLdToRecipe(o: Record<string, unknown>, sourceUrl: string): RecipeOut | null {
  const ingredients = asArray(o.recipeIngredient).map((l) => parseIngredientLine(decodeEntities(String(l))))
  const steps = flattenInstructions(o.recipeInstructions).map((text) => ({ text }))
  const yieldText = Array.isArray(o.recipeYield) ? String(o.recipeYield[0] ?? '') : String(o.recipeYield ?? '')
  const yieldN = asNumber((/\d+(?:\.\d+)?/.exec(yieldText) ?? [])[0] ?? null)
  const cat = (Array.isArray(o.recipeCategory) ? String(o.recipeCategory[0] ?? '') : String(o.recipeCategory ?? '')).toLowerCase()
  const mealType = /breakfast|brunch/.test(cat) ? 'breakfast' : /lunch/.test(cat) ? 'lunch' : /dessert|sweet/.test(cat) ? 'dessert' : /side/.test(cat) ? 'side' : /snack|appetizer/.test(cat) ? 'snack' : /dinner|main|entree|entr/.test(cat) ? 'dinner' : null
  const cuisine = Array.isArray(o.recipeCuisine) ? String(o.recipeCuisine[0] ?? '') : String(o.recipeCuisine ?? '')
  const prep = isoMinutes(o.prepTime)
  const cook = isoMinutes(o.cookTime)
  const total = isoMinutes(o.totalTime) ?? (prep !== null || cook !== null ? (prep ?? 0) + (cook ?? 0) : null)
  const raw = {
    title: decodeEntities(String(o.name ?? '')),
    description: typeof o.description === 'string' ? decodeEntities(o.description) : null,
    cuisine: cuisine.trim() || null,
    mealType,
    baseYield: yieldN,
    yieldUnit: 'servings',
    ingredients,
    steps,
    activeMinutes: prep,
    standingMinutes: cook,
    totalMinutes: total,
    equipment: [],
    tags: [],
  }
  return cleanRecipe(raw, sourceUrl)
}

function flattenInstructions(v: unknown, depth = 0): string[] {
  if (depth > 4 || !v) return []
  if (typeof v === 'string') return v.split(/\r?\n+/).map((s) => decodeEntities(stripTags(s)).trim()).filter(Boolean)
  if (Array.isArray(v)) return v.flatMap((x) => flattenInstructions(x, depth + 1))
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (o.itemListElement) return flattenInstructions(o.itemListElement, depth + 1)
    const text = typeof o.text === 'string' ? o.text : typeof o.name === 'string' ? o.name : ''
    return text ? [decodeEntities(stripTags(text)).trim()] : []
  }
  return []
}

/** "PT1H30M" -> 90. Null when absent or unreadable. */
export function isoMinutes(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i.exec(v.trim())
  if (!m) return null
  const [, d, h, min] = m
  const n = (Number(d ?? 0) * 24 + Number(h ?? 0)) * 60 + Number(min ?? 0)
  return n > 0 ? n : null
}

const UNIT_WORDS = /^(cups?|c\.?|tbsps?|tablespoons?|tsps?|teaspoons?|oz\.?|ounces?|lbs?\.?|pounds?|g|grams?|kg|ml|l|liters?|litres?|cans?|cloves?|slices?|sticks?|packages?|pkgs?|jars?|bunch(?:es)?|pinch(?:es)?|dash(?:es)?|quarts?|qt|pints?|pt|heads?|stalks?|sprigs?|pieces?|large|medium|small)$/i

/** "2 1/2 cups flour, sifted" -> amount 2.5, unit cup, name flour, preparation sifted. Plain and forgiving. */
export function parseIngredientLine(line: string): RecipeOut['ingredients'][number] {
  let text = stripTags(line).replace(/\s+/g, ' ').trim()
  const optional = /\(optional\)|,\s*optional\b/i.test(text)
  text = text.replace(/\(optional\)/gi, '').replace(/,\s*optional\b/gi, '').trim()
  text = text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  let amount: number | null = null
  const num = /^((?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?|[¼½¾⅓⅔⅛])(?:\s*(?:-|to)\s*(?:\d+\/\d+|\d+(?:\.\d+)?))?\s*/.exec(text)
  if (num) {
    amount = fraction(num[1] ?? '')
    text = text.slice(num[0].length)
  }
  let unit: string | null = null
  const first = text.split(' ')[0] ?? ''
  if (first && UNIT_WORDS.test(first) && !/^(large|medium|small)$/i.test(first)) {
    unit = normalizeUnit(first)
    text = text.slice(first.length).trim()
  }
  text = text.replace(/^(?:of\s+)/i, '')
  let preparation: string | null = null
  const comma = text.indexOf(',')
  if (comma > 0) {
    preparation = text.slice(comma + 1).trim() || null
    text = text.slice(0, comma).trim()
  }
  return { ingredientName: text || line.trim(), amount, unit, preparation, optional }
}

function fraction(s: string): number | null {
  const glyph: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 }
  if (glyph[s] !== undefined) return glyph[s]!
  const parts = s.trim().split(/\s+/)
  let total = 0
  for (const p of parts) {
    const f = /^(\d+)\/(\d+)$/.exec(p)
    if (f) total += Number(f[1]) / Number(f[2])
    else if (/^\d+(?:\.\d+)?$/.test(p)) total += Number(p)
    else return null
  }
  return Math.round(total * 1000) / 1000
}

function normalizeUnit(u: string): string {
  const w = u.toLowerCase().replace(/\.$/, '')
  if (/^(c|cups?)$/.test(w)) return 'cup'
  if (/^(tbsps?|tablespoons?)$/.test(w)) return 'tbsp'
  if (/^(tsps?|teaspoons?)$/.test(w)) return 'tsp'
  if (/^(oz|ounces?)$/.test(w)) return 'oz'
  if (/^(lbs?|pounds?)$/.test(w)) return 'lb'
  if (/^(g|grams?)$/.test(w)) return 'g'
  if (/^(l|liters?|litres?)$/.test(w)) return 'l'
  if (/^(qt|quarts?)$/.test(w)) return 'quart'
  if (/^(pt|pints?)$/.test(w)) return 'pint'
  return w.replace(/s$/, '')
}

/* ------------------------------------------------------------------------------------------------
   Visible text for the model fallback
   ------------------------------------------------------------------------------------------------ */

function visibleText(html: string): string {
  const noScripts = html.replace(/<(script|style|noscript|svg|nav|footer|header|iframe)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
  return decodeEntities(noScripts.replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|section|article)>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ')
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
}
