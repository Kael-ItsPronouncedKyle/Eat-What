// Per-household daily caps and the ai_usage ledger. One row per model call, so House > Usage can show the spend.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export interface Usage {
  inputTokens: number
  outputTokens: number
  images?: number
}

/** Rough list prices per million tokens, used only for the cost_cents column. */
const COST_IN_PER_MTOK_CENTS = 400
const COST_OUT_PER_MTOK_CENTS = 2000

/** How many calls this household may still make today for one function, or 0 at the cap. */
export async function remainingToday(admin: SupabaseClient, householdId: string, fn: string, max: number): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { count } = await admin.from('ai_usage').select('id', { count: 'exact', head: true }).eq('household_id', householdId).eq('fn', fn).gte('created_at', since)
  return Math.max(0, max - (count ?? 0))
}

export function capMessage(fn: string, max: number): string {
  const what: Record<string, string> = {
    'parse-intent': 'partner requests',
    'url-import': 'recipe imports',
    'recipe-generate': 'recipe ideas',
    'receipt-parse': 'receipt scans',
  }
  return `This household has used today's ${max} ${what[fn] ?? 'calls'}. Try again tomorrow.`
}

export async function recordUsage(admin: SupabaseClient, householdId: string, userId: string | null, fn: string, usage: Usage): Promise<void> {
  await admin.from('ai_usage').insert({
    household_id: householdId,
    user_id: userId,
    fn,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    images: usage.images ?? 0,
    cost_cents: Math.round((usage.inputTokens * COST_IN_PER_MTOK_CENTS + usage.outputTokens * COST_OUT_PER_MTOK_CENTS) / 1_000_000),
  })
}
