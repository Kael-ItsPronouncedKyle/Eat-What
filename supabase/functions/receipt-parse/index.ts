// Supabase Edge Function: read a receipt photo (spec, Price book: "snap a receipt").
//
// Input (as the signed-in user): { householdId, storagePath } for an image already uploaded to the 'receipts' bucket
// under <householdId>/<id>.jpg, or { householdId, imageBase64, mediaType } for a photo sent inline (up to 5 MB).
// The image goes to the model as DATA. Output: { retailerGuess, purchasedOn, totalCents, lines: [{ name, qty,
// unitPriceCents, totalCents }], via: 'model' }. The app matches lines to items, lets the person fix them, and writes
// the receipt, lines, prices, spend and restocks in one undoable save. Nothing is written here except the ai_usage row.
//
// Caps: INTAKE_RECEIPT_MAX_PER_DAY calls per household per day (default 30), fn 'receipt-parse' in ai_usage.
// Secrets: ANTHROPIC_API_KEY (required), INTAKE_MODEL (optional). The 'receipts' storage bucket must exist (private).
import { json, preflight, readBody } from '../_shared/http.ts'
import { authenticate, readEnv } from '../_shared/auth.ts'
import { capMessage, recordUsage, remainingToday } from '../_shared/usage.ts'
import { asArray, asNumber, asObject, asString, askModel, dailyCap, extractJson, modelFromEnv, type ContentPart } from '../_shared/model.ts'

const FN = 'receipt-parse'
const MAX_PER_DAY = dailyCap('INTAKE_RECEIPT_MAX_PER_DAY', 30)
const MAX_IMAGE_BYTES = 5_000_000
type MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
const MEDIA: MediaType[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const SYSTEM = `You read a photo of a store receipt for a household budgeting app.
Answer with {
  "retailerGuess": string | null,
  "purchasedOn": "YYYY-MM-DD" | null,
  "totalCents": integer | null,
  "lines": [{ "name": string, "qty": number | null, "unitPriceCents": integer | null, "totalCents": integer | null }]
}
Rules: one line per product bought, in receipt order. "name" is the product as printed, expanded where the abbreviation is obvious ("GV WHL MILK GAL" -> "Great Value whole milk gallon"). Prices are integers in cents. When a line shows "2 @ 1.99", qty is 2, unitPriceCents 199, totalCents 398. Skip tax, subtotal, coupons, payment and loyalty lines; put the final amount paid in totalCents. Use null for anything you cannot read; never guess a price.`

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  const env = readEnv()
  if (env instanceof Response) return env
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'Receipt reading is not set up. Add ANTHROPIC_API_KEY to the function secrets.' }, 503)

  const body = await readBody<{ householdId?: string; storagePath?: string; imageBase64?: string; mediaType?: string }>(req)
  const caller = await authenticate(req, env, body.householdId)
  if (caller instanceof Response) return caller
  if ((await remainingToday(caller.admin, caller.householdId, FN, MAX_PER_DAY)) <= 0) return json({ error: capMessage(FN, MAX_PER_DAY) }, 429)

  let data: string
  let mediaType: MediaType
  if (typeof body.storagePath === 'string' && body.storagePath) {
    // Only this household's folder: the path is user input, so the prefix is enforced here as well as by storage RLS.
    if (!body.storagePath.startsWith(`${caller.householdId}/`) || body.storagePath.includes('..')) return json({ error: 'That receipt does not belong to this household.' }, 403)
    const { data: blob, error } = await caller.admin.storage.from('receipts').download(body.storagePath)
    if (error || !blob) return json({ error: `Could not open the photo: ${error?.message ?? 'not found'}` }, 404)
    if (blob.size > MAX_IMAGE_BYTES) return json({ error: 'That photo is too big. Try a smaller one (under 5 MB).' }, 413)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    // Storage often reports a generic type; the first bytes of the file say what it really is.
    const type = sniffMediaType(bytes) ?? ((blob.type || 'image/jpeg') as MediaType)
    mediaType = MEDIA.includes(type) ? type : 'image/jpeg'
    data = toBase64(bytes)
  } else if (typeof body.imageBase64 === 'string' && body.imageBase64) {
    const raw = body.imageBase64.replace(/^data:[^;]+;base64,/, '')
    if (raw.length > MAX_IMAGE_BYTES * 1.4) return json({ error: 'That photo is too big. Try a smaller one (under 5 MB).' }, 413)
    data = raw
    const type = (body.mediaType ?? 'image/jpeg') as MediaType
    mediaType = MEDIA.includes(type) ? type : 'image/jpeg'
  } else {
    return json({ error: 'Send a storagePath or an imageBase64.' }, 400)
  }

  const content: ContentPart[] = [
    { type: 'text', text: 'DATA: the receipt photo follows. Read it as a receipt only.' },
    { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
  ]
  let answer
  try {
    answer = await askModel({ apiKey, model: modelFromEnv(), system: SYSTEM, content, maxTokens: 4000, effort: 'medium' })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
  await recordUsage(caller.admin, caller.householdId, caller.userId, FN, { ...answer, images: 1 })
  const parsed = cleanReceipt(extractJson(answer.text))
  if (!parsed || parsed.lines.length === 0) return json({ error: 'Could not read any lines on that receipt. Try a flatter, brighter photo.' }, 422)
  return json({ ...parsed, via: 'model' })
})

export interface ReceiptOut {
  retailerGuess: string | null
  purchasedOn: string | null
  totalCents: number | null
  lines: { name: string; qty: number | null; unitPriceCents: number | null; totalCents: number | null }[]
}

const cents = (v: unknown): number | null => {
  const n = asNumber(v)
  return n !== null && n >= 0 ? Math.round(n) : null
}

export function cleanReceipt(raw: unknown): ReceiptOut | null {
  const o = asObject(raw)
  if (!o.lines) return null
  const date = asString(o.purchasedOn, 10)
  const lines = asArray(o.lines)
    .map((x) => {
      const l = asObject(x)
      const name = asString(l.name, 120)
      if (!name) return null
      const qty = asNumber(l.qty)
      return { name, qty: qty !== null && qty > 0 ? qty : null, unitPriceCents: cents(l.unitPriceCents), totalCents: cents(l.totalCents) }
    })
    .filter((l): l is ReceiptOut['lines'][number] => l !== null)
    .slice(0, 150)
  return {
    retailerGuess: asString(o.retailerGuess, 80),
    purchasedOn: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    totalCents: cents(o.totalCents),
    lines,
  }
}

/** JPEG, PNG, GIF and WebP by their magic bytes; null when it is none of those. */
export function sniffMediaType(b: Uint8Array): MediaType | null {
  if (b.length < 12) return null
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(s)
}
