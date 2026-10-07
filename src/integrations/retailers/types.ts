import type { ListLine, Retailer } from '@/domain/types'

/** Every retailer sits behind this adapter (spec: Risks, "retailers are adapters behind one interface"). */
export interface SendPlan {
  /** What the button says: "Send 14 items to Instacart", "Copy 3 items for Amazon", "Share H-E-B list". */
  actionLabel: string
  /** Opens in a new tab when present. */
  url: string | null
  /** Text to copy or share when the retailer has no cart link. */
  text: string
  /** How the lines leave the app. */
  method: 'link' | 'copy' | 'share' | 'print'
  /** Per-line links (Amazon add-to-cart with ASIN, Walmart item pages). */
  lineLinks: { lineId: string; url: string }[]
  notes: string[]
}

export interface RetailerAdapter {
  kind: Retailer['kind']
  label: string
  plan(retailer: Retailer, lines: ListLine[], opts: { searchTerms: Map<string, string>; externalIds: Map<string, string>; plainText: string }): SendPlan
}
