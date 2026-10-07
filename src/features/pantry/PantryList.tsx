import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { Item } from '@/domain/types'
import { CATEGORY_LABEL } from '@/domain/types'
import { cycleStatus, expiryHorizon } from '@/domain/status'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useUndoable } from '@/app/hooks/useActions'
import { useToday } from '@/app/hooks/useToday'
import { setItemStatus } from '@/data/mutations'
import { Chip, EmptyState, Icon, StatusChip } from '@/design/components'
import { ItemCard } from './ItemCard'

type View = 'all' | 'staples' | 'low'

export function PantryList() {
  const data = useHouseholdData()
  const today = useToday()
  const { run } = useUndoable()
  const [locationId, setLocationId] = useState<string | 'all'>('all')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<View>('all')

  const locations = useMemo(() => data.locations.filter((l) => !l.isFreezerShelf).sort((a, b) => a.sortOrder - b.sortOrder), [data.locations])
  const locById = useMemo(() => new Map(data.locations.map((l) => [l.id, l] as const)), [data.locations])
  const freezerBlocks = data.freezer_blocks.filter((b) => b.countRemaining > 0)
  const blockCount = freezerBlocks.reduce((n, b) => n + b.countRemaining, 0)

  const q = query.trim().toLowerCase()
  const items = useMemo(() => {
    let list = data.items.slice()
    if (locationId !== 'all') list = list.filter((i) => i.locationId === locationId)
    if (q) list = list.filter((i) => i.name.toLowerCase().includes(q) || i.canonicalName.includes(q) || CATEGORY_LABEL[i.category].toLowerCase().includes(q))
    if (view === 'staples') list = list.filter((i) => i.trackMode === 'status')
    if (view === 'low') list = list.filter((i) => i.status !== 'ok')
    const rank: Record<Item['status'], number> = { out: 0, low: 1, ok: 2 }
    return list.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name))
  }, [data.items, locationId, q, view])

  const expiring = useMemo(() => data.items.filter((i) => expiryHorizon(i, today) !== null && expiryHorizon(i, today) !== 'this_week'), [data.items, today])
  const lowOut = data.items.filter((i) => i.status !== 'ok').length

  if (data.loading) return <div className="page" aria-busy="true" />

  return (
    <div className="page">
      <div className="page-title">
        <h1>Pantry</h1>
        <div className="row">
          <Link to="/pantry/scan" className="btn btn-icon btn-ghost" aria-label="Scan a barcode or receipt" title="Scan">
            <Icon name="camera" size="1.4em" />
          </Link>
          <Link to="/pantry/add" className="btn btn-primary" aria-label="Add item">
            <Icon name="plus" /> <span className="btn-label">Add</span>
          </Link>
        </div>
      </div>

      <div className="pantry-toolbar">
        <div className="row-wrap">
          <Link to="/pantry/freezer" className="btn btn-secondary">
            <Icon name="snowflake" /> <span className="btn-label">Freezer shelf</span> <span className="badge badge-accent num">{blockCount}</span>
          </Link>
          <Chip selected={view === 'low'} tone="low" icon="alert" onClick={() => setView(view === 'low' ? 'all' : 'low')}>
            Low or out {lowOut > 0 ? `(${lowOut})` : ''}
          </Chip>
          <Chip selected={view === 'staples'} onClick={() => setView(view === 'staples' ? 'all' : 'staples')}>
            Staples grid
          </Chip>
        </div>
        <label className="search-row">
          <span className="visually-hidden">Search the pantry</span>
          <Icon name="search" className="search-icon" />
          <input className="input" type="search" placeholder="Search items" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="location-chips" role="group" aria-label="Location">
          <Chip selected={locationId === 'all'} onClick={() => setLocationId('all')}>
            All
          </Chip>
          {locations.map((l) => (
            <Chip key={l.id} selected={locationId === l.id} onClick={() => setLocationId(l.id)}>
              {l.name}
            </Chip>
          ))}
        </div>
      </div>

      {expiring.length > 0 && !q && view === 'all' ? (
        <div className={`expiry-banner ${expiring.some((i) => expiryHorizon(i, today) === 'expired') ? 'is-expired' : ''}`} role="status">
          <Icon name="clock" />
          <div className="grow">
            <strong>{expiring.length === 1 ? '1 item' : `${expiring.length} items`}</strong> expiring soon or expired.{' '}
            <Link to="/cook?mode=use_it_up">See use-it-up recipes</Link>
          </div>
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          icon="pantry"
          title={q ? `Nothing matches "${query}"` : 'Nothing here yet'}
          body={q ? 'Try a shorter word, or add it.' : 'Add your first item, or import from Neelix in House.'}
          action={
            <Link to={`/pantry/add${q ? `?name=${encodeURIComponent(query)}` : ''}`} className="btn btn-primary btn-lg">
              Add {q ? `"${query}"` : 'an item'}
            </Link>
          }
        />
      ) : view === 'staples' ? (
        <StaplesGrid items={items} onTap={(item) => void run((repo, actor) => setItemStatus(repo, item, cycleStatus(item.status), actor))} />
      ) : (
        <div className="item-list" aria-label="Items">
          {items.map((i) => (
            <ItemCard key={i.id} item={i} location={i.locationId ? (locById.get(i.locationId) ?? null) : null} today={today} />
          ))}
        </div>
      )}
      <p className="small muted" style={{ marginTop: 'var(--space-5)' }}>
        Tap a staple to cycle OK, Low, Out. Long-press or open an item for counts and details.
      </p>
    </div>
  )
}

export function StaplesGrid({ items, onTap }: { items: Item[]; onTap: (item: Item) => void }) {
  return (
    <div className="staples-grid" role="list" aria-label="Staples">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="listitem"
          className={`staple is-${item.status}`}
          onClick={() => onTap(item)}
          aria-label={`${item.name}, ${item.status === 'ok' ? 'OK' : item.status === 'low' ? 'Low' : 'Out'}. Tap to change.`}
        >
          <span className="staple-name">{item.name}</span>
          <StatusChip status={item.status} size="sm" />
        </button>
      ))}
    </div>
  )
}
