import { useState } from 'react'
import type { ListSend } from '@/domain/types'
import { formatCents } from '@/domain/money'
import { formatDate } from '@/domain/dates'
import { formatQuantity } from '@/domain/units'
import { BackHeader } from '@/app/Shell'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useUndoable } from '@/app/hooks/useActions'
import { Badge, Button, Card, EmptyState, Sheet, TextField } from '@/design/components'
import { receiveSend } from './mutations'

/** Sent lists waiting for delivery. Receiving flips lines to stocked and logs the actual total. */
export function Ordered() {
  const data = useHouseholdData()
  const { run } = useUndoable()
  const [receiving, setReceiving] = useState<ListSend | null>(null)
  const [actual, setActual] = useState('')
  const sends = data.list_sends.filter((s) => s.status === 'ordered').sort((a, b) => b.sentAt.localeCompare(a.sentAt))
  const received = data.list_sends.filter((s) => s.status === 'received').sort((a, b) => (b.receivedAt ?? '').localeCompare(a.receivedAt ?? '')).slice(0, 10)
  const linesFor = (s: ListSend) => data.list_lines.filter((l) => l.listSendId === s.id)
  const retailerName = (id: string | null) => data.retailers.find((r) => r.id === id)?.name ?? 'List'

  return (
    <div className="page">
      <BackHeader title="Ordered" to="/shop" />
      {sends.length === 0 ? <EmptyState icon="cart" title="Nothing on the way" body="Sent lists wait here until you mark them received." /> : null}
      <div className="stack">
        {sends.map((s) => (
          <Card key={s.id} tone="accent">
            <div className="stack">
              <div className="spread">
                <div>
                  <div className="card-title">{retailerName(s.retailerId)}</div>
                  <div className="small muted">Sent {formatDate(s.sentAt.slice(0, 10), 'weekday')} · {s.lineCount} items{s.estimatedTotalCents !== null ? ` · ~${formatCents(s.estimatedTotalCents)}` : ''}</div>
                </div>
                {s.externalUrl ? <a className="btn btn-ghost" href={s.externalUrl} target="_blank" rel="noopener noreferrer">Open</a> : null}
              </div>
              <ul className="small muted">
                {linesFor(s).map((l) => (
                  <li key={l.id}>{l.qty ? `${formatQuantity({ amount: l.qty, unit: l.unit })} ` : ''}{l.name}</li>
                ))}
              </ul>
              <Button variant="primary" size="lg" full icon="check" onClick={() => { setActual(''); setReceiving(s) }}>
                It arrived
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {received.length > 0 ? (
        <div className="section">
          <h3>Received</h3>
          <div className="list">
            {received.map((s) => (
              <div key={s.id} className="list-row">
                <div className="grow row-main">
                  <div className="row-title">{retailerName(s.retailerId)}</div>
                  <div className="row-subtitle muted small">{s.receivedAt ? formatDate(s.receivedAt.slice(0, 10)) : ''} · {s.lineCount} items</div>
                </div>
                <div className="num">{s.actualTotalCents !== null ? formatCents(s.actualTotalCents) : s.estimatedTotalCents !== null ? <Badge>~{formatCents(s.estimatedTotalCents)}</Badge> : null}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <Sheet
        open={!!receiving}
        title="Mark as received"
        onClose={() => setReceiving(null)}
        description="Stock goes up for every line. Enter the real total from the receipt so the budget uses actuals."
        footer={
          receiving ? (
            <Button variant="primary" size="lg" full onClick={() => { const cents = actual.trim() ? Math.round(Number(actual) * 100) : null; void run((repo, actor) => receiveSend(repo, receiving, linesFor(receiving), data.items, Number.isFinite(cents as number) ? cents : null, actor)); setReceiving(null) }}>
              Received
            </Button>
          ) : null
        }
      >
        <TextField label="Actual total (dollars, optional)" inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} hint={receiving?.estimatedTotalCents ? `Estimate was ${formatCents(receiving.estimatedTotalCents)}. Leave blank if you do not have the receipt.` : undefined} />
      </Sheet>
    </div>
  )
}
