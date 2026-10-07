import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { ListLine } from '@/domain/types'
import { groupByDestination, plainTextList, restockNeeds, routeLine, subtractStock, mergeIntoList, estimateLineCents, type DestinationGroup } from '@/domain/listing'
import { monthSummary } from '@/domain/budget'
import { formatCents } from '@/domain/money'
import { formatQuantity } from '@/domain/units'
import { monthKey } from '@/domain/dates'
import { newId } from '@/domain/ids'
import { useSession } from '@/app/session'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useUndoable } from '@/app/hooks/useActions'
import { useToday } from '@/app/hooks/useToday'
import { useCollection } from '@/data/provider'
import { addListLine, dropListLine, logEvent } from '@/data/mutations'
import { planSend } from '@/integrations/retailers/adapters'
import { copyText, printText, shareText } from '@/integrations/share'
import { Badge, Button, Card, EmptyState, Icon, Sheet, TextField } from '@/design/components'
import { buildLine, sendGroup, updateLine } from './mutations'
import { BudgetBar } from './Budget'

/** The one list, grouped by destination. Send per destination; nothing leaves without a tap. */
export function ShopList() {
  const { household } = useSession()
  const data = useHouseholdData()
  const today = useToday()
  const { run, repo, actor } = useUndoable()
  const households = useCollection('households', household?.id)
  const row = households.rows.find((h) => h.id === household?.id) ?? null
  const [addText, setAddText] = useState('')
  const [sendTarget, setSendTarget] = useState<DestinationGroup | null>(null)
  const [moving, setMoving] = useState<ListLine | null>(null)

  const safe = <T,>(fn: () => T, fallback: T): T => {
    try {
      return fn()
    } catch {
      return fallback
    }
  }
  const openLines = useMemo(() => data.list_lines.filter((l) => l.status === 'open'), [data.list_lines])
  const routeCtx = useMemo(() => ({ items: data.items, retailers: data.retailers, routingRules: data.routing_rules, links: data.item_retailer_links }), [data.items, data.retailers, data.routing_rules, data.item_retailer_links])
  const priceCtx = useMemo(() => ({ prices: data.prices, items: data.items }), [data.prices, data.items])
  const groups = useMemo(() => safe(() => groupByDestination(openLines, data.retailers, priceCtx), [{ retailer: null, lines: openLines, estimatedCents: null, unknownPrices: openLines.length }] as DestinationGroup[]), [openLines, data.retailers, priceCtx])
  const summary = useMemo(() => (row ? safe(() => monthSummary(data.spend, data.list_sends, row, monthKey(today)), null) : null), [row, data.spend, data.list_sends, today])
  const restock = useMemo(() => safe(() => restockNeeds(data.items).filter((n) => !openLines.some((l) => l.itemId === n.itemId)), []), [data.items, openLines])
  const totalEst = groups.reduce((n, g) => n + (g.estimatedCents ?? 0), 0)

  const addFromText = async () => {
    if (!household || !addText.trim()) return
    const line = buildLine(household.id, actor, { name: addText.trim(), position: openLines.length })
    line.retailerId = safe(() => routeLine(line, routeCtx), null)
    await run((r, a) => addListLine(r, line, a))
    setAddText('')
  }

  const addRestock = async () => {
    if (!household || restock.length === 0) return
    const lines = safe(() => subtractStock(restock, data.items), [])
    const merged = safe(() => mergeIntoList(openLines, lines, { householdId: household.id, now: new Date().toISOString(), newId }), null)
    const toAdd = merged ? merged.added : []
    for (const l of toAdd) l.retailerId = safe(() => routeLine(l, routeCtx), null)
    if (toAdd.length === 0 && (!merged || merged.updated.length === 0)) return
    const before = openLines.map((l) => ({ ...l }))
    await repo.table('list_lines').putMany([...toAdd, ...(merged?.updated ?? [])])
    await run(async (r, a) => {
      const event = await logEvent(r, household.id, a, { entityType: 'list_lines', entityId: null, action: 'restock', summary: `Added ${toAdd.length} low or out ${toAdd.length === 1 ? 'item' : 'items'} to the list` })
      return {
        event,
        undo: async () => {
          for (const l of toAdd) await r.table('list_lines').remove(l.id)
          await r.table('list_lines').putMany(before)
        },
      }
    })
  }

  const send = async (g: DestinationGroup) => {
    if (!household) return
    const plan = planSend(g.retailer, g.lines, sendOpts(g))
    if (plan.method === 'link' && plan.url) window.open(plan.url, '_blank', 'noopener')
    if (plan.method === 'copy') await copyText(plan.text)
    if (plan.method === 'share') await shareText(`${g.retailer?.name ?? 'Shopping'} list`, plan.text)
    if (plan.method === 'print') printText(`${g.retailer?.name ?? 'Shopping'} list`, plan.text)
    await run((r, a) => sendGroup(r, household.id, g.retailer, g.lines, g.estimatedCents, plan.url, a))
    setSendTarget(null)
  }

  const sendOpts = (g: DestinationGroup) => {
    const searchTerms = new Map<string, string>()
    const externalIds = new Map<string, string>()
    for (const l of g.lines) {
      const link = data.item_retailer_links.find((x) => x.itemId === l.itemId && x.retailerId === g.retailer?.id)
      if (l.searchTerm) searchTerms.set(l.id, l.searchTerm)
      else if (link?.searchTerm) searchTerms.set(l.id, link.searchTerm)
      if (link?.externalId) externalIds.set(l.id, link.externalId)
    }
    return { searchTerms, externalIds, plainText: safe(() => plainTextList(g, data.items), g.lines.map((l) => `- ${l.qty ? formatQuantity({ amount: l.qty, unit: l.unit }) + ' ' : ''}${l.name}`).join('\n')) }
  }

  if (data.loading) return <div className="page" aria-busy="true" />

  return (
    <div className="page">
      <div className="page-title">
        <h1>Shop</h1>
        <div className="row">
          <Link to="/shop/ordered" className="btn btn-ghost">Ordered</Link>
          <Link to="/shop/prices" className="btn btn-ghost">Prices</Link>
        </div>
      </div>

      {summary ? (
        <Link to="/shop/budget" style={{ textDecoration: 'none', color: 'inherit' }}>
          <BudgetBar summary={summary} compact />
        </Link>
      ) : null}

      <form
        className="row"
        style={{ marginTop: 'var(--space-4)' }}
        onSubmit={(e) => {
          e.preventDefault()
          void addFromText()
        }}
      >
        <TextField label="Add to the list" className="grow" placeholder="Dawn, 2 lb thighs, paper towels" value={addText} onChange={(e) => setAddText(e.target.value)} />
        <Button type="submit" variant="primary" icon="plus" style={{ alignSelf: 'flex-end' }} disabled={!addText.trim()}>Add</Button>
      </form>

      {restock.length > 0 ? (
        <Card tone="low" style={{ marginTop: 'var(--space-4)' }}>
          <div className="spread">
            <div>
              <strong>{restock.length} {restock.length === 1 ? 'item is' : 'items are'} Low or Out</strong> and not on the list yet.
              <div className="small muted">{restock.slice(0, 4).map((n) => n.name).join(', ')}{restock.length > 4 ? ', ...' : ''}</div>
            </div>
            <Button variant="primary" onClick={() => void addRestock()}>Add them</Button>
          </div>
        </Card>
      ) : null}

      {openLines.length === 0 ? (
        <EmptyState icon="cart" title="The list is empty" body="Low and Out items, plan needs, and anything you add land here, each with a store." />
      ) : (
        groups.map((g) => (
          <section key={g.retailer?.id ?? 'unrouted'} className="dest-group" aria-label={`${g.retailer?.name ?? 'In person'} list`}>
            <div className="dest-header">
              <h3 className="row">
                <Icon name={g.retailer?.kind === 'amazon' ? 'bag' : g.retailer?.kind === 'in_person' || !g.retailer ? 'list' : 'cart'} />
                {g.retailer?.name ?? 'In person'} <span className="badge num">{g.lines.length}</span>
              </h3>
              <div className="small muted num">
                {g.estimatedCents !== null && g.estimatedCents > 0 ? `~${formatCents(g.estimatedCents)}` : ''}
                {g.unknownPrices > 0 ? ` (${g.unknownPrices} without a price)` : ''}
              </div>
            </div>
            <div className="list">
              {g.lines.map((l) => (
                <LineRow key={l.id} line={l} estimate={safe(() => estimateLineCents(l, priceCtx), null)} onDrop={() => void run((r, a) => dropListLine(r, l, a))} onMove={() => setMoving(l)} />
              ))}
            </div>
            <div style={{ marginTop: 'var(--space-2)' }}>
              <Button variant="primary" size="lg" full icon="send" onClick={() => setSendTarget(g)}>
                {planSend(g.retailer, g.lines, sendOpts(g)).actionLabel}
              </Button>
            </div>
          </section>
        ))
      )}
      {openLines.length > 0 && totalEst > 0 ? <p className="small muted" style={{ marginTop: 'var(--space-4)' }}>Estimated total across stores: {formatCents(totalEst)}. Unknown prices are left out, never guessed.</p> : null}

      <Sheet
        open={!!sendTarget}
        title={sendTarget ? `Send to ${sendTarget.retailer?.name ?? 'the list'}` : 'Send'}
        onClose={() => setSendTarget(null)}
        description="This is the one place that touches money. Review, then tap once."
        footer={sendTarget ? <><Button variant="primary" size="lg" full icon="send" onClick={() => void send(sendTarget)}>{planSend(sendTarget.retailer, sendTarget.lines, sendOpts(sendTarget)).actionLabel}</Button><Button size="lg" full onClick={() => setSendTarget(null)}>Not yet</Button></> : null}
      >
        {sendTarget ? (
          <div className="stack">
            <div className="list">
              {sendTarget.lines.map((l) => (
                <div key={l.id} className="line-row">
                  <div className="grow line-name">{l.qty ? `${formatQuantity({ amount: l.qty, unit: l.unit })} ` : ''}{l.name}</div>
                  <div className="price-chip small">{formatCents(safe(() => estimateLineCents(l, priceCtx), null))}</div>
                </div>
              ))}
            </div>
            <div className="spread">
              <strong>Estimated</strong>
              <strong className="num">{sendTarget.estimatedCents !== null ? formatCents(sendTarget.estimatedCents) : 'unknown'}</strong>
            </div>
            {summary && summary.capCents !== null && sendTarget.estimatedCents !== null ? (
              <p className="small muted">
                After this, {formatCents(Math.max(0, (summary.remainingCents ?? 0) - sendTarget.estimatedCents))} of this month's budget is left.
                {(summary.remainingCents ?? 0) - sendTarget.estimatedCents < 0 ? ` Over by ${formatCents(sendTarget.estimatedCents - (summary.remainingCents ?? 0))}. Still yours to send.` : ''}
              </p>
            ) : null}
            {planSend(sendTarget.retailer, sendTarget.lines, sendOpts(sendTarget)).notes.map((n, i) => (
              <p key={i} className="small muted">{n}</p>
            ))}
          </div>
        ) : null}
      </Sheet>

      <Sheet open={!!moving} title={moving ? `Where should ${moving.name} go?` : ''} onClose={() => setMoving(null)}>
        {moving ? (
          <div className="stack">
            {data.retailers.map((r) => (
              <Button key={r.id} size="lg" full variant={moving.retailerId === r.id ? 'primary' : 'secondary'} onClick={() => { void run((repo2, a) => updateLine(repo2, moving, { retailerId: r.id }, a, `${moving.name} moved to ${r.name}`)); setMoving(null) }}>
                {r.name}
              </Button>
            ))}
            <Button size="lg" full variant={moving.retailerId === null ? 'primary' : 'secondary'} onClick={() => { void run((repo2, a) => updateLine(repo2, moving, { retailerId: null }, a, `${moving.name} moved to in person`)); setMoving(null) }}>
              In person
            </Button>
          </div>
        ) : null}
      </Sheet>
    </div>
  )
}

function LineRow({ line, estimate, onDrop, onMove }: { line: ListLine; estimate: number | null; onDrop: () => void; onMove: () => void }) {
  const reasons = line.reasons.map((r) => r.text ?? REASON_WORD[r.kind] ?? r.kind)
  return (
    <div className="line-row">
      <Button variant="ghost" className="line-check" icon="check" aria-label={`Done with ${line.name}`} onClick={onDrop} />
      <div className="grow">
        <div className="line-name">
          {line.qty ? `${formatQuantity({ amount: line.qty, unit: line.unit })} ` : ''}
          {line.name}
        </div>
        <div className="line-reasons">{reasons.join(' · ')}</div>
      </div>
      <div className="price-chip small">{estimate !== null ? formatCents(estimate) : <Badge>no price</Badge>}</div>
      <Button variant="ghost" size="sm" icon="swap" aria-label={`Move ${line.name} to another store`} onClick={onMove} />
    </div>
  )
}

const REASON_WORD: Record<string, string> = { low: 'Running low', out: 'Out', plan: 'For the plan', batch: 'Cook week', manual: 'Added by hand', voice: 'Said aloud', almost_there: 'One short', stretch: 'Stretch' }
