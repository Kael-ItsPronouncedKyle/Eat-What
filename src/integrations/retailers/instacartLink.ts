import type { ListLine } from '@/domain/types'
import { getSupabaseClient } from '@/data/supabase/client'

export interface InstacartLinkResult {
  url: string
  environment: 'development' | 'production'
}

/** Ask the instacart-link edge function for a shopping-list page. Returns null when there is no backend, no key, or the call fails;
    the caller then falls back to the search-plus-copy plan. Nothing is sent without the user's tap. */
export async function requestInstacartLink(input: { title: string; lines: ListLine[]; searchTerms: Map<string, string>; upcs: Map<string, string> }): Promise<InstacartLinkResult | null> {
  const client = getSupabaseClient()
  if (!client) return null
  try {
    const { data, error } = await client.functions.invoke<{ url?: string; environment?: 'development' | 'production'; error?: string }>('instacart-link', {
      body: {
        title: input.title,
        linkback: typeof location !== 'undefined' ? `${location.origin}/shop/ordered` : undefined,
        lines: input.lines.map((l) => ({ name: l.name, displayText: input.searchTerms.get(l.id) ?? undefined, quantity: l.qty, unit: l.unit, upc: input.upcs.get(l.id) ?? undefined })),
      },
    })
    if (error || !data?.url) return null
    return { url: data.url, environment: data.environment ?? 'development' }
  } catch {
    return null
  }
}
