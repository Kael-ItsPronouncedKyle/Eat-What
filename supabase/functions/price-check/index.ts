// Supabase Edge Function: the weekly web price check (spec, Price book: "an optional weekly web check for the household's ZIP").
//
// Two ways in:
//   1. Scheduled: a bearer token equal to the service role key (the GitHub Actions workflow .github/workflows/price-check.yml).
//      Runs every household whose settings.priceCheck.enabled is true.
//   2. On demand: a signed-in owner or editor posts { householdId } from House > Price check. Runs that household only.
//
// For each household and each retailer with a web presence, the function asks Claude (with the web search tool) for the
// shelf price of up to 25 items per call at that retailer near the household's ZIP, in strict JSON. Answers pass the same
// validation the app unit-tests (quotes.ts): sourced, confident, fresh, not an outlier. Accepted quotes become `prices`
// rows with source 'web' and the page URL in the note. Rejected ones write nothing: the price book never guesses.
//
// Caps: PRICE_CHECK_MAX_CALLS_PER_DAY calls per household per day (default 12), recorded in ai_usage with fn 'price-check'.
// Secrets: ANTHROPIC_API_KEY (required), PRICE_CHECK_MODEL (default claude-opus-5-5), PRICE_CHECK_MAX_CALLS_PER_DAY.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { buildPrompt, extractJson, splitBatches, validateQuotes, type QuoteRequestItem } from './quotes.ts'

const MODEL = Deno.env.get('PRICE_CHECK_MODEL') ?? 'claude-opus-5-5'
const MAX_CALLS = Number(Deno.env.get('PRICE_CHECK_MAX_CALLS_PER_DAY') ?? '12')
const MAX_WEB_SEARCHES_PER_CALL = 8
// Rough list price per million tokens for the usage ledger; only used for the cost_cents column.
const COST_IN_PER_MTOK_CENTS = 400
const COST_OUT_PER_MTOK_CENTS = 2000

interface RunResult {
  householdId: string
  checked: number
  written: number
  calls: number
  skipped: string[]
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'The price check is not configured. Add ANTHROPIC_API_KEY to the function secrets.' }, 503)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const admin = createClient(supabaseUrl, serviceKey)
  let body: { householdId?: string } = {}
  try {
    body = await req.json()
  } catch {
    /* scheduled calls send no body */
  }

  let householdIds: string[] = []
  let userId: string | null = null
  if (token && token === serviceKey) {
    const { data } = await admin.from('households').select('id, settings').is('deleted_at', null)
    householdIds = (data ?? []).filter((h) => (h.settings as { priceCheck?: { enabled?: boolean } })?.priceCheck?.enabled).map((h) => h.id as string)
  } else {
    const asUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: userData, error } = await asUser.auth.getUser()
    if (error || !userData.user) return json({ error: 'Not signed in' }, 401)
    userId = userData.user.id
    if (!body.householdId) return json({ error: 'householdId is required' }, 400)
    const { data: m } = await admin.from('memberships').select('role').eq('household_id', body.householdId).eq('user_id', userId).maybeSingle()
    if (!m || !['owner', 'editor'].includes(m.role as string)) return json({ error: 'Only an owner or editor can run the check' }, 403)
    householdIds = [body.householdId]
  }

  const results: RunResult[] = []
  for (const hid of householdIds) {
    try {
      results.push(await runHousehold(admin, hid, userId, apiKey))
    } catch (e) {
      results.push({ householdId: hid, checked: 0, written: 0, calls: 0, skipped: [e instanceof Error ? e.message : String(e)] })
    }
  }
  return json({ results })
})

async function runHousehold(admin: SupabaseClient, householdId: string, userId: string | null, apiKey: string): Promise<RunResult> {
  const today = new Date().toISOString().slice(0, 10)
  const result: RunResult = { householdId, checked: 0, written: 0, calls: 0, skipped: [] }
  const { data: household } = await admin.from('households').select('id, zip, settings').eq('id', householdId).single()
  if (!household?.zip) {
    result.skipped.push('No ZIP set for this household')
    return result
  }
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { count: usedToday } = await admin.from('ai_usage').select('id', { count: 'exact', head: true }).eq('household_id', householdId).eq('fn', 'price-check').gte('created_at', since)
  let budget = MAX_CALLS - (usedToday ?? 0)
  if (budget <= 0) {
    result.skipped.push(`Daily cap of ${MAX_CALLS} calls reached; try again tomorrow`)
    return result
  }

  const { data: retailers } = await admin.from('retailers').select('id, name, kind, is_primary_grocery, is_primary_other').eq('household_id', householdId).is('deleted_at', null)
  const { data: items } = await admin.from('items').select('id, name, category, auto_list').eq('household_id', householdId).is('deleted_at', null).order('name')
  const { data: prices } = await admin.from('prices').select('item_id, retailer_id, price_cents, unit, observed_on').eq('household_id', householdId).is('deleted_at', null).order('observed_on', { ascending: false })

  const NON_GROCERY = new Set(['cleaning', 'paper', 'household', 'pet', 'pharmacy'])
  const webRetailers = (retailers ?? []).filter((r) => (r.kind as string) !== 'in_person')
  for (const retailer of webRetailers) {
    const wants = (items ?? []).filter((i) => ((retailer.is_primary_other && !retailer.is_primary_grocery) ? NON_GROCERY.has(i.category as string) : !NON_GROCERY.has(i.category as string)))
    if (wants.length === 0) continue
    const unitFor = (itemId: string) => prices?.find((p) => p.item_id === itemId && (p.retailer_id === retailer.id || p.retailer_id === null))?.unit ?? null
    const previousCents: Record<string, number> = {}
    for (const p of prices ?? []) if (p.retailer_id === retailer.id && !(p.item_id in previousCents)) previousCents[p.item_id as string] = p.price_cents as number
    const request: QuoteRequestItem[] = wants.map((i) => ({ id: i.id as string, name: i.name as string, unit: unitFor(i.id as string) }))
    for (const batch of splitBatches(request)) {
      if (budget <= 0) {
        result.skipped.push(`Stopped at the daily cap of ${MAX_CALLS} calls`)
        break
      }
      budget -= 1
      result.calls += 1
      result.checked += batch.length
      const prompt = buildPrompt({ retailerName: retailer.name as string, zip: household.zip as string, today, items: batch })
      const answer = await askClaude(apiKey, prompt)
      await admin.from('ai_usage').insert({
        household_id: householdId,
        user_id: userId,
        fn: 'price-check',
        input_tokens: answer.inputTokens,
        output_tokens: answer.outputTokens,
        cost_cents: Math.round((answer.inputTokens * COST_IN_PER_MTOK_CENTS + answer.outputTokens * COST_OUT_PER_MTOK_CENTS) / 1_000_000),
      })
      const { accepted } = validateQuotes(extractJson(answer.text), { items: batch, today, previousCents })
      if (accepted.length === 0) continue
      const rows = accepted.map((q) => ({
        household_id: householdId,
        item_id: q.itemId,
        retailer_id: retailer.id,
        price_cents: q.priceCents,
        unit_qty: q.unitQty,
        unit: q.unit,
        source: 'web',
        observed_on: q.observedOn,
        note: `Web check (confidence ${q.confidence.toFixed(1)}): ${q.sourceUrl}`,
        created_by: userId,
        updated_by: userId,
      }))
      const { error } = await admin.from('prices').insert(rows)
      if (error) result.skipped.push(`${retailer.name}: ${error.message}`)
      else result.written += rows.length
    }
  }

  const settings = (household.settings as Record<string, unknown>) ?? {}
  const priceCheck = { ...((settings.priceCheck as Record<string, unknown>) ?? {}), lastRunAt: new Date().toISOString(), lastRunWritten: result.written, lastRunChecked: result.checked }
  await admin.from('households').update({ settings: { ...settings, priceCheck } }).eq('id', householdId)
  return result
}

async function askClaude(apiKey: string, prompt: string): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      system: 'You look up grocery prices for a household budgeting app. You only report prices you found on a page, and you answer in the exact JSON shape requested, with no prose.',
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: MAX_WEB_SEARCHES_PER_CALL }],
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Claude said ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = (await res.json()) as { content: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } }
  // The final text block carries the JSON; search result blocks come before it.
  const text = data.content.filter((b) => b.type === 'text' && b.text).map((b) => b.text).join('\n')
  return { text, inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
