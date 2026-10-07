import type { Household, Item, Price, Retailer } from '@/domain/types'

/** A weekly price check for a household's ZIP (spec: Price book, "optional weekly web check").
    Providers are adapters: the app never guesses, so a provider that cannot answer returns no quote.
    Phase 1 ships the interface and a null provider; a real provider needs a server-held key or a scrape policy decided by the owner. */
export interface PriceQuoteResult {
  itemId: string
  retailerId: string | null
  priceCents: number
  unit: string | null
  unitQty: number | null
  observedOn: string
  source: Price['source']
  note?: string
}

export interface PriceProvider {
  readonly id: string
  readonly label: string
  /** Which retailer kinds this provider can quote. */
  supports(retailer: Retailer): boolean
  /** Quote prices for items at a retailer in a ZIP. Items it cannot price are simply absent from the result. */
  quote(input: { household: Pick<Household, 'id' | 'zip'>; retailer: Retailer; items: Item[]; today: string }): Promise<PriceQuoteResult[]>
}

/** The default: answers nothing, so the price book stays honest until a real provider is configured. */
export const nullPriceProvider: PriceProvider = {
  id: 'none',
  label: 'No web check configured',
  supports: () => false,
  quote: async () => [],
}

let provider: PriceProvider = nullPriceProvider

export function setPriceProvider(p: PriceProvider): void {
  provider = p
}

export function getPriceProvider(): PriceProvider {
  return provider
}

/** Run the weekly check for one household across its retailers. Returns rows ready for the prices table (ids assigned by the caller). */
export async function runWeeklyPriceCheck(input: { household: Pick<Household, 'id' | 'zip'>; retailers: Retailer[]; items: Item[]; today: string }): Promise<PriceQuoteResult[]> {
  const p = getPriceProvider()
  const out: PriceQuoteResult[] = []
  for (const r of input.retailers) {
    if (r.deletedAt || !p.supports(r)) continue
    try {
      out.push(...(await p.quote({ household: input.household, retailer: r, items: input.items, today: input.today })))
    } catch {
      /* a failed provider never writes a guess */
    }
  }
  return out
}
