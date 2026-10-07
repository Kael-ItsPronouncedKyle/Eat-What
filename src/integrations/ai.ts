/* Client helpers for the Phase 3 intake edge functions (supabase/functions/parse-intent, url-import, recipe-generate,
   receipt-parse). One helper per function. Each returns `{ data: null, error }` with a plain reason when there is no
   backend, the function is missing, or it answered with an error; callers fall back to local behavior and show the
   reason. Nothing here writes to the database: saving always goes through the feature mutations so undo works. */
import type { Intent, MealType } from '@/domain/types'
import { getSupabaseClient } from '@/data/supabase/client'

export interface AiResult<T> {
  data: T | null
  error: string | null
}

export const NO_BACKEND = 'This needs the Supabase backend. In local mode the app uses its own rules instead.'

/** True when the app has a backend to call. The functions may still be undeployed; each helper reports that too. */
export function hasAiBackend(): boolean {
  return getSupabaseClient() !== null
}

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<AiResult<T>> {
  const client = getSupabaseClient()
  if (!client) return { data: null, error: NO_BACKEND }
  try {
    const { data, error } = await client.functions.invoke<T & { error?: string }>(fn, { body })
    if (error) {
      // A 4xx/5xx body with a plain message comes back inside the error's context when available.
      const ctx = (error as { context?: Response }).context
      if (ctx && typeof ctx.json === 'function') {
        try {
          const payload = (await ctx.clone().json()) as { error?: string }
          if (payload?.error) return { data: null, error: payload.error }
        } catch {
          /* fall through to the generic message */
        }
      }
      return { data: null, error: error.message || `The ${fn} function did not answer.` }
    }
    if (data && typeof data === 'object' && 'error' in data && data.error) return { data: null, error: String(data.error) }
    return { data: data ?? null, error: data ? null : `The ${fn} function returned nothing.` }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) }
  }
}

/* ---- parse-intent ---- */

export interface ParsedIntents {
  intents: Intent[]
  via: 'server'
}

/** Ask the server parser for intents. The context packet is built on the server from the household's own rows. */
export function parseIntentRemote(householdId: string, utterance: string, today: string): Promise<AiResult<ParsedIntents>> {
  return invoke<ParsedIntents>('parse-intent', { householdId, utterance, today })
}

/* ---- url-import and recipe-generate share one recipe shape ---- */

export interface ImportedIngredient {
  ingredientName: string
  amount: number | null
  unit: string | null
  preparation: string | null
  optional: boolean
}

export interface ImportedRecipe {
  title: string
  description: string | null
  cuisine: string | null
  mealType: MealType | null
  baseYield: number
  yieldUnit: string
  ingredients: ImportedIngredient[]
  steps: { text: string; timerMinutes?: number }[]
  activeMinutes: number | null
  standingMinutes: number | null
  totalMinutes: number | null
  equipment: string[]
  tags: string[]
  sourceUrl: string | null
}

export interface UrlImportResult {
  recipe: ImportedRecipe
  via: 'jsonld' | 'model'
}

export function importRecipeFromUrl(householdId: string, url: string): Promise<AiResult<UrlImportResult>> {
  return invoke<UrlImportResult>('url-import', { householdId, url })
}

export interface AllergyHit {
  ingredient: string
  severity: string
  substitute: string | null
  personId: string | null
}

export interface GeneratedRecipe {
  recipe: ImportedRecipe
  allergyHits: AllergyHit[]
  via: 'model'
}

export function generateRecipe(householdId: string, request: string): Promise<AiResult<GeneratedRecipe>> {
  return invoke<GeneratedRecipe>('recipe-generate', { householdId, request })
}

/* ---- receipt-parse ---- */

export interface ParsedReceipt {
  retailerGuess: string | null
  purchasedOn: string | null
  totalCents: number | null
  lines: { name: string; qty: number | null; unitPriceCents: number | null; totalCents: number | null }[]
  via: 'model'
}

/** Send a receipt photo already in the 'receipts' bucket (path from Repository.uploadImage), or the image bytes inline. */
export function parseReceipt(householdId: string, source: { storagePath: string } | { imageBase64: string; mediaType: string }): Promise<AiResult<ParsedReceipt>> {
  return invoke<ParsedReceipt>('receipt-parse', { householdId, ...source })
}

/** Open Food Facts product lookup for a scanned barcode. Public, no key, called from the phone. */
export interface BarcodeProduct {
  code: string
  name: string
  quantity: string | null
  brand: string | null
}

export async function lookupBarcode(code: string, fetchFn: typeof fetch = fetch): Promise<AiResult<BarcodeProduct>> {
  const clean = code.replace(/\D/g, '')
  if (clean.length < 6) return { data: null, error: 'A barcode has at least 6 digits.' }
  try {
    const res = await fetchFn(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(clean)}.json?fields=product_name,quantity,brands`)
    if (!res.ok) return { data: null, error: res.status === 404 ? 'Open Food Facts does not know this code. Type the name instead.' : `Open Food Facts answered ${res.status}.` }
    const body = (await res.json()) as { status?: number; product?: { product_name?: string; quantity?: string; brands?: string } }
    const name = body.product?.product_name?.trim()
    if (!body.product || !name) return { data: null, error: 'Open Food Facts does not know this code. Type the name instead.' }
    return { data: { code: clean, name, quantity: body.product.quantity?.trim() || null, brand: body.product.brands?.split(',')[0]?.trim() || null }, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? `Could not reach Open Food Facts: ${e.message}` : 'Could not reach Open Food Facts.' }
  }
}
