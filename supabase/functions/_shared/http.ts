// Response helpers shared by the intake functions. Browsers call these through supabase-js `functions.invoke`, which
// sends a CORS preflight first, so every function answers OPTIONS and carries the same headers on its JSON replies.

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
}

/** Answer a preflight, or reject anything that is not a POST. Returns null when the request should proceed. */
export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  return null
}

/** Read the JSON body, or an empty object when there is none. */
export async function readBody<T extends Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const body = (await req.json()) as unknown
    return body && typeof body === 'object' ? (body as T) : ({} as T)
  } catch {
    return {} as T
  }
}
