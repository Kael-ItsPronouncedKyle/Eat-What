import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { Item, PriceSource } from '@/domain/types'
import { priceFor } from '@/domain/budget'
import { formatCents } from '@/domain/money'
import { daysBetween, formatDate } from '@/domain/dates'
import { BackHeader } from '@/app/Shell'
import { useSession } from '@/app/session'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useUndoable } from '@/app/hooks/useActions'
import { useToday } from '@/app/hooks/useToday'
import { useCollection } from '@/data/provider'
import { Badge, Button, Chip, Icon, Sheet, SelectField, TextField } from '@/design/components'
import { addPrice } from './mutations'

const SOURCE_LABEL: Record<PriceSource, string> = { receipt: 'receipt', manual: 'typed in', web: 'web check', starter: 'starter estimate', instacart: 'Instacart', import: 'imported' }

/** Per household, per retailer. Every price carries its source and date; 7-day stale nudge; starter estimates are labeled. */
export function PriceBook() {
  const { household } = useSession()
  const data = useHouseholdData()
  const today = useToday()
  const { run } = useUndoable()
  const households = useCollection('households', household?.id)
  const row = households.rows.find((h) => h.id === household?.id) ?? null
  const [retailerId, setRetailerId] = useState<string | 'all'>('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Item | null>(null)
  const [price, setPrice] = useState('')
  const [unit, setUnit] = useState('')
  const [priceRetailer, setPriceRetailer] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.items
      .filter((i) => !q || i.name.toLowerCase().includes(q))
      .map((i) => {
        let quote = null
        try {
          quote = priceFor(i.id, retailerId === 'all' ? null : retailerId, data.prices, today)
        } catch {
          quote = null
        }
        if (retailerId !== 'all' && quote && quote.price.retailerId !== retailerId) quote = null
        return { item: i, quote }
      })
      .sort((a, b) => Number(!!b.quote) - Number(!!a.quote) || a.item.name.localeCompare(b.item.name))
  }, [data.items, data.prices, retailerId, query, today])

  const starterCount = rows.filter((r) => r.quote?.starter).length
  const staleCount = rows.filter((r) => r.quote && r.quote.stale && !r.quote.starter).length
  const stale = starterCount + staleCount
  const oldest = data.prices.reduce<string | null>((acc, p) => (acc === null || p.observedOn < acc ? p.observedOn : acc), null)
  const banner = [
    starterCount > 0 ? `${starterCount} ${starterCount === 1 ? 'price is a starter estimate' : 'prices are starter estimates'}` : '',
    staleCount > 0 ? `${staleCount} ${staleCount === 1 ? 'is' : 'are'} 7+ days old${oldest ? ` (oldest ${daysBetween(oldest, today)} days)` : ''}` : '',
  ].filter(Boolean).join('; ')

  return (
    <div className="page">
      <BackHeader title="Price book" to="/shop" />
      <p className="muted" style={{ marginBottom: 'var(--space-3)' }}>
        {household?.name}{row?.zip ? ` · ZIP ${row.zip}` : ''}. Prices come from receipts (most trusted), what you type, and the <Link to="/house/prices">weekly web check</Link> when it is on. Unknown prices stay blank.
      </p>
      {stale > 0 ? (
        <div className="expiry-banner" role="status" style={{ marginBottom: 'var(--space-3)' }}>
          <Icon name="clock" />
          <div className="grow">{banner}. A receipt scan or a typed price replaces them.</div>
        </div>
      ) : null}
      <div className="row-wrap" style={{ marginBottom: 'var(--space-3)' }} role="group" aria-label="Retailer">
        <Chip selected={retailerId === 'all'} onClick={() => setRetailerId('all')}>Any store</Chip>
        {data.retailers.map((r) => (
          <Chip key={r.id} selected={retailerId === r.id} onClick={() => setRetailerId(r.id)}>{r.name}</Chip>
        ))}
      </div>
      <TextField label="Find an item" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="thighs" />
      <div className="list" style={{ marginTop: 'var(--space-3)' }}>
        {rows.map(({ item, quote }) => (
          <button key={item.id} type="button" className="list-row list-row-button" onClick={() => { setEditing(item); setPrice(quote ? (quote.price.priceCents / 100).toFixed(2) : ''); setUnit(quote?.price.unit ?? item.unit ?? ''); setPriceRetailer(quote?.price.retailerId ?? data.retailers.find((r) => r.isPrimaryGrocery)?.id ?? '') }}>
            <div className="grow row-main">
              <div className="row-title">{item.name}</div>
              <div className="row-subtitle muted small">
                {quote ? `${data.retailers.find((r) => r.id === quote.price.retailerId)?.name ?? 'Any'} · ${formatDate(quote.price.observedOn)} · ${SOURCE_LABEL[quote.price.source]}` : 'No price yet'}
                {quote?.price.source === 'web' && webSourceUrl(quote.price.note) ? (
                  <>
                    {' · '}
                    <a href={webSourceUrl(quote.price.note)!} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>source</a>
                  </>
                ) : null}
              </div>
            </div>
            <div className="row-right num">
              {quote ? (
                <>
                  <strong>{formatCents(quote.price.priceCents)}</strong>
                  {quote.price.unit ? <span className="small muted"> /{quote.price.unit}</span> : null}
                  {quote.starter ? <div><Badge tone="low">starter</Badge></div> : quote.stale ? <div><Badge tone="low">stale</Badge></div> : null}
                </>
              ) : (
                <Badge>add</Badge>
              )}
            </div>
          </button>
        ))}
      </div>
      <Sheet
        open={!!editing}
        title={editing ? `Price for ${editing.name}` : ''}
        onClose={() => setEditing(null)}
        footer={
          editing && household ? (
            <Button variant="primary" size="lg" full disabled={!(Number(price) >= 0) || !price.trim()} onClick={() => { void run((repo, actor) => addPrice(repo, household.id, { itemId: editing.id, retailerId: priceRetailer || null, priceCents: Math.round(Number(price) * 100), unitQty: 1, unit: unit.trim() || null, source: 'manual', observedOn: today, receiptId: null, note: null }, actor, editing.name)); setEditing(null) }}>
              Save price
            </Button>
          ) : null
        }
      >
        <div className="stack">
          <SelectField label="Store" value={priceRetailer} onChange={(e) => setPriceRetailer(e.target.value)}>
            <option value="">Any</option>
            {data.retailers.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </SelectField>
          <div className="grid-2">
            <TextField label="Price (dollars)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            <TextField label="Per" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="lb, each, pack" />
          </div>
          <p className="small muted">Typed prices count as confirmed. Receipt scans (Phase 3) will update these on their own.</p>
        </div>
      </Sheet>
    </div>
  )
}

/** The web check stores the page it read in the note: "Web check (confidence 0.8): https://..." */
function webSourceUrl(note: string | null): string | null {
  const m = note?.match(/https?:\/\/\S+/)
  return m ? m[0] : null
}
