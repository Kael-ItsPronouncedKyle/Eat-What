// Supabase Edge Function: build an Instacart shopping-list page from list lines.
// Runs as the signed-in user (anon key + forwarded Authorization); the Instacart key lives only in function secrets.
// Endpoint shape per the Instacart Developer Platform docs (verified Oct 2026 in docs/spec-review.md section 5):
//   POST {host}/idp/v1/products/products_link, Authorization: Bearer <key>
//   body: { title, line_items: [{ name, display_text?, line_item_measurements?: [{ quantity, unit }], upcs?: string[] }], expires_in?, landing_page_configuration? }
//   response: { products_link_url }
// Hosts: https://connect.dev.instacart.tools (development key) or https://connect.instacart.com (production key).
import { createClient } from 'npm:@supabase/supabase-js@2'

interface LineIn {
  name: string
  displayText?: string
  quantity?: number | null
  unit?: string | null
  upc?: string | null
}

const UNIT_MAP: Record<string, string> = { lb: 'lb', oz: 'oz', g: 'g', kg: 'kg', cup: 'cup', each: 'each', can: 'each', bottle: 'each', bag: 'each', box: 'each', pack: 'each', roll: 'each', jar: 'each', ml: 'ml', l: 'l', quart: 'quart', pint: 'pint', gallon: 'gallon' }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const auth = req.headers.get('Authorization') ?? ''
  const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } })
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Not signed in' }, 401)

  const apiKey = Deno.env.get('INSTACART_API_KEY')
  if (!apiKey) return json({ error: 'Instacart is not configured. Add INSTACART_API_KEY to the function secrets.' }, 503)
  const environment = Deno.env.get('INSTACART_ENV') === 'production' ? 'production' : 'development'
  const host = environment === 'production' ? 'https://connect.instacart.com' : 'https://connect.dev.instacart.tools'

  let body: { title?: string; lines?: LineIn[]; linkback?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Bad request' }, 400)
  }
  const lines = (body.lines ?? []).filter((l) => l && typeof l.name === 'string' && l.name.trim()).slice(0, 100)
  if (lines.length === 0) return json({ error: 'No lines' }, 400)

  const payload = {
    title: (body.title ?? 'Quartermaster list').slice(0, 80),
    line_items: lines.map((l) => ({
      name: l.name.trim().slice(0, 100),
      ...(l.displayText ? { display_text: l.displayText.slice(0, 100) } : {}),
      ...(l.quantity && l.quantity > 0 ? { line_item_measurements: [{ quantity: l.quantity, unit: UNIT_MAP[(l.unit ?? 'each').toLowerCase()] ?? 'each' }] } : {}),
      ...(l.upc ? { upcs: [l.upc] } : {}),
    })),
    expires_in: 30,
    landing_page_configuration: { ...(body.linkback ? { partner_linkback_url: body.linkback } : {}), enable_pantry_items: false },
  }

  const res = await fetch(`${host}/idp/v1/products/products_link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    return json({ error: `Instacart said ${res.status}`, detail: text.slice(0, 500), environment }, 502)
  }
  const data = (await res.json()) as { products_link_url?: string }
  if (!data.products_link_url) return json({ error: 'Instacart returned no link', environment }, 502)
  return json({ url: data.products_link_url, environment })
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
