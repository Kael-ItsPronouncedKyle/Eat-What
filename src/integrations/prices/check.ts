import { getSupabaseClient } from '@/data/supabase/client'

export interface PriceCheckRun {
  householdId: string
  checked: number
  written: number
  calls: number
  skipped: string[]
}

/** Ask the price-check edge function to run now for one household. Returns null with a reason when there is no backend
    or the function is not deployed; the price book then stays as it was. Nothing is written on the client. */
export async function requestPriceCheck(householdId: string): Promise<{ run: PriceCheckRun | null; error: string | null }> {
  const client = getSupabaseClient()
  if (!client) return { run: null, error: 'The web check needs the Supabase backend. In local mode, type prices or scan a receipt.' }
  try {
    const { data, error } = await client.functions.invoke<{ results?: PriceCheckRun[]; error?: string }>('price-check', { body: { householdId } })
    if (error) return { run: null, error: error.message }
    if (data?.error) return { run: null, error: data.error }
    const run = data?.results?.find((r) => r.householdId === householdId) ?? null
    return { run, error: run ? null : 'The check ran but returned nothing for this household.' }
  } catch (e) {
    return { run: null, error: e instanceof Error ? e.message : String(e) }
  }
}
