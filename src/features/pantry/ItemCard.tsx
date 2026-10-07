import { Link } from 'react-router'
import type { Item, Location } from '@/domain/types'
import { formatQuantity } from '@/domain/units'
import { expiryHorizon } from '@/domain/status'
import { formatDate } from '@/domain/dates'
import { Badge, Button, Card, StatusChip, Stepper } from '@/design/components'
import { useUndoable } from '@/app/hooks/useActions'
import { adjustItemQty, setItemQty, setItemStatus } from '@/data/mutations'

const TONE: Record<Item['status'], 'ok' | 'low' | 'out'> = { ok: 'ok', low: 'low', out: 'out' }

export function ItemCard({ item, location, today }: { item: Item; location: Location | null; today: string }) {
  const { run } = useUndoable()
  const horizon = expiryHorizon(item, today)
  const qtyText = item.trackMode === 'count' && item.qty !== null ? formatQuantity({ amount: item.qty, unit: item.unit }) : null
  return (
    <Card tone={TONE[item.status]} className="item-card-wrap">
      <div className="item-card">
        <div className="grow">
          <Link to={`/pantry/item/${item.id}`} className="card-title" style={{ textDecoration: 'none', color: 'inherit' }}>
            {item.name}
          </Link>
          <div className="item-meta small muted">
            {location ? <span>{location.name}</span> : null}
            {item.par !== null && item.trackMode === 'count' ? <span>par {formatQuantity({ amount: item.par, unit: item.unit })}</span> : null}
            {item.useBy ? (
              <Badge tone={horizon === 'expired' ? 'out' : horizon === 'two_days' ? 'low' : 'neutral'}>
                {horizon === 'expired' ? `Expired ${formatDate(item.useBy)}` : `Use by ${formatDate(item.useBy)}`}
              </Badge>
            ) : null}
            {item.alwaysHave ? <Badge>always have</Badge> : null}
          </div>
        </div>
        <div className="item-actions">
          {item.trackMode === 'count' ? (
            <Stepper
              label={item.name}
              value={item.qty ?? 0}
              unit={item.unit ?? undefined}
              step={item.unit && ['lb', 'kg', 'cup', 'quart'].includes(item.unit) ? 0.5 : 1}
              onChange={(next) => {
                const delta = next - (item.qty ?? 0)
                if (delta === 0) return
                void run((repo, actor) => (Math.abs(delta) === 1 || Math.abs(delta) === 0.5 ? adjustItemQty(repo, item, delta, actor) : setItemQty(repo, item, next, actor)))
              }}
            />
          ) : (
            <StatusButtons item={item} onSet={(s) => void run((repo, actor) => setItemStatus(repo, item, s, actor))} />
          )}
        </div>
      </div>
      {qtyText && item.status !== 'ok' ? (
        <div className="small muted" style={{ marginTop: 6 }}>
          <StatusChip status={item.status} size="sm" /> {item.status === 'out' ? 'Nothing left.' : `Below par.`}
        </div>
      ) : null}
    </Card>
  )
}

/** Three explicit buttons so nobody has to cycle through states; the current one is pressed. */
export function StatusButtons({ item, onSet, size = 'md' }: { item: Item; onSet: (s: Item['status']) => void; size?: 'md' | 'lg' }) {
  return (
    <div className="row" role="group" aria-label={`${item.name} status`}>
      {(['ok', 'low', 'out'] as const).map((s) => (
        <Button key={s} variant={item.status === s ? s : 'secondary'} size={size} aria-pressed={item.status === s} onClick={() => onSet(s)}>
          {s === 'ok' ? 'OK' : s === 'low' ? 'Low' : 'Out'}
        </Button>
      ))}
    </div>
  )
}
