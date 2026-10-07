import type { ListLine, Retailer } from '@/domain/types'
import type { RetailerAdapter, SendPlan } from './types'

const count = (n: number, word: string) => `${n} ${n === 1 ? word : word + 's'}`

/** Instacart: the Developer Platform products-link call needs a server-held API key (Phase 3 edge function).
    Until then the send opens the household's store with the first item searched and copies the full list. */
const instacart: RetailerAdapter = {
  kind: 'instacart',
  label: 'Instacart',
  plan(retailer, lines, { searchTerms, plainText }) {
    const store = (retailer.config.storeName ?? 'kroger').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const first = lines[0]
    const q = first ? encodeURIComponent(searchTerms.get(first.id) ?? first.name) : ''
    const url = first ? `https://www.instacart.com/store/${store}/s?k=${q}` : `https://www.instacart.com/store/${store}`
    return {
      actionLabel: `Send ${count(lines.length, 'item')} to Instacart`,
      url,
      text: plainText,
      method: 'link',
      lineLinks: lines.map((l) => ({ lineId: l.id, url: `https://www.instacart.com/store/${store}/s?k=${encodeURIComponent(searchTerms.get(l.id) ?? l.name)}` })),
      notes: ['The list is copied so you can paste each item into Instacart search. A one-tap cart link arrives with the Phase 3 server piece.'],
    }
  },
}

/** Amazon add-to-cart URL form: needs an ASIN per item, learned once per household. */
const amazon: RetailerAdapter = {
  kind: 'amazon',
  label: 'Amazon',
  plan(retailer, lines, { externalIds, plainText }) {
    const tag = retailer.config.affiliateTag
    const withAsin = lines.filter((l) => externalIds.has(l.id))
    const params = withAsin.map((l, i) => `ASIN.${i + 1}=${encodeURIComponent(externalIds.get(l.id)!)}&Quantity.${i + 1}=${Math.max(1, Math.round(l.qty ?? 1))}`)
    const url = withAsin.length ? `https://www.amazon.com/gp/aws/cart/add.html?${params.join('&')}${tag ? `&AssociateTag=${encodeURIComponent(tag)}` : ''}` : null
    const notes: string[] = []
    if (withAsin.length < lines.length) notes.push(`${count(lines.length - withAsin.length, 'item')} have no Amazon product saved yet. Open the item and add its ASIN once.`)
    return {
      actionLabel: url ? `Add ${count(withAsin.length, 'item')} to Amazon cart` : `Copy ${count(lines.length, 'item')} for Amazon`,
      url,
      text: plainText,
      method: url ? 'link' : 'copy',
      lineLinks: lines.map((l) => ({ lineId: l.id, url: externalIds.has(l.id) ? `https://www.amazon.com/dp/${externalIds.get(l.id)}` : `https://www.amazon.com/s?k=${encodeURIComponent(l.name)}` })),
      notes,
    }
  },
}

/** Walmart: item pages by id when known; otherwise a search link per line and a copyable list. */
const walmart: RetailerAdapter = {
  kind: 'walmart',
  label: 'Walmart',
  plan(_retailer, lines, { externalIds, plainText }) {
    return {
      actionLabel: `Copy ${count(lines.length, 'item')} for Walmart`,
      url: lines[0] ? `https://www.walmart.com/search?q=${encodeURIComponent(lines[0].name)}` : null,
      text: plainText,
      method: 'copy',
      lineLinks: lines.map((l) => ({ lineId: l.id, url: externalIds.has(l.id) ? `https://www.walmart.com/ip/${externalIds.get(l.id)}` : `https://www.walmart.com/search?q=${encodeURIComponent(l.name)}` })),
      notes: [],
    }
  },
}

/** H-E-B has no public ordering API we can rely on: a shareable list in H-E-B aisle order plus copy for the H-E-B app search. */
const heb: RetailerAdapter = {
  kind: 'heb',
  label: 'H-E-B',
  plan(_retailer, lines, { plainText }) {
    return {
      actionLabel: `Share H-E-B list (${count(lines.length, 'item')})`,
      url: null,
      text: plainText,
      method: 'share',
      lineLinks: lines.map((l) => ({ lineId: l.id, url: `https://www.heb.com/search?q=${encodeURIComponent(l.name)}` })),
      notes: ['Paste item names into the H-E-B app search, or shop the list in store.'],
    }
  },
}

const kroger: RetailerAdapter = {
  kind: 'kroger',
  label: 'Kroger',
  plan(_retailer, lines, { plainText }) {
    return {
      actionLabel: `Copy ${count(lines.length, 'item')} for Kroger`,
      url: null,
      text: plainText,
      method: 'copy',
      lineLinks: lines.map((l) => ({ lineId: l.id, url: `https://www.kroger.com/search?query=${encodeURIComponent(l.name)}` })),
      notes: [],
    }
  },
}

const inPerson: RetailerAdapter = {
  kind: 'in_person',
  label: 'In person',
  plan(_retailer, lines, { plainText }) {
    return { actionLabel: `Print or share list (${count(lines.length, 'item')})`, url: null, text: plainText, method: 'print', lineLinks: [], notes: [] }
  },
}

const other: RetailerAdapter = { ...inPerson, kind: 'other', label: 'Other' }

export const ADAPTERS: Record<Retailer['kind'], RetailerAdapter> = { instacart, amazon, walmart, heb, kroger, in_person: inPerson, other }

export function planSend(retailer: Retailer | null, lines: ListLine[], opts: { searchTerms: Map<string, string>; externalIds: Map<string, string>; plainText: string }): SendPlan {
  const adapter = retailer ? ADAPTERS[retailer.kind] : inPerson
  return adapter.plan(retailer ?? ({ kind: 'in_person', config: {} } as Retailer), lines, opts)
}
