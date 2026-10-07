import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { Item, ItemCategory, TrackMode } from '@/domain/types'
import { CATEGORY_LABEL } from '@/domain/types'
import { formatQuantity } from '@/domain/units'
import { expiryHorizon } from '@/domain/status'
import { formatDate, relativeDay } from '@/domain/dates'
import { priceFor } from '@/domain/budget'
import { formatCents } from '@/domain/money'
import { BackHeader } from '@/app/Shell'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useUndoable } from '@/app/hooks/useActions'
import { useToday } from '@/app/hooks/useToday'
import { useCollection } from '@/data/provider'
import { useSession } from '@/app/session'
import { Badge, Button, Card, EmptyState, Icon, Segmented, SelectField, Sheet, StatusChip, Stepper, TextField, Toggle } from '@/design/components'
import { setItemQty, setItemStatus } from '@/data/mutations'
import { addAlias, removeItem, updateItem } from './mutations'
import { StatusButtons } from './ItemCard'

export function ItemDetail() {
  const { id } = useParams()
  const data = useHouseholdData()
  const today = useToday()
  const navigate = useNavigate()
  const { household } = useSession()
  const { run } = useUndoable()
  const events = useCollection('activity_events', household?.id)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [aliasText, setAliasText] = useState('')
  const [editing, setEditing] = useState(false)

  const item = data.items.find((i) => i.id === id) ?? null
  const aliases = data.item_aliases.filter((a) => a.itemId === id)
  const links = data.item_retailer_links.filter((l) => l.itemId === id)
  const history = useMemo(() => events.rows.filter((e) => e.entityId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20), [events.rows, id])
  const prices = useMemo(() => {
    if (!item) return []
    return data.retailers
      .map((r) => {
        try {
          return { retailer: r, quote: priceFor(item.id, r.id, data.prices, today) }
        } catch {
          return { retailer: r, quote: null }
        }
      })
      .filter((x) => x.quote && x.quote.price.retailerId === x.retailer.id)
  }, [item, data.retailers, data.prices, today])

  if (data.loading) return <div className="page" aria-busy="true" />
  if (!item) {
    return (
      <div className="page">
        <BackHeader title="Item" to="/pantry" />
        <EmptyState icon="pantry" title="That item is gone" body="It may have been removed. Undo is in the activity feed under House." />
      </div>
    )
  }

  const location = data.locations.find((l) => l.id === item.locationId) ?? null
  const horizon = expiryHorizon(item, today)
  const person = data.persons.find((p) => p.id === item.personId) ?? null

  return (
    <div className="page">
      <BackHeader
        title={item.name}
        to="/pantry"
        right={
          <Button variant="ghost" icon="edit" onClick={() => setEditing(true)}>
            Edit
          </Button>
        }
      />

      <Card tone={item.status}>
        <div className="stack">
          <div className="row-wrap">
            <StatusChip status={item.status} size="lg" />
            {location ? <Badge>{location.name}</Badge> : null}
            <Badge>{CATEGORY_LABEL[item.category]}</Badge>
            {person ? <Badge tone="accent">{person.name}'s</Badge> : null}
            {item.alwaysHave ? <Badge>always have</Badge> : null}
          </div>
          {item.trackMode === 'count' ? (
            <div className="spread">
              <div className="detail-stat">
                <span className="label">On hand</span>
                <span className="large strong num">{formatQuantity({ amount: item.qty ?? 0, unit: item.unit })}</span>
                {item.par !== null ? <span className="small muted">Par {formatQuantity({ amount: item.par, unit: item.unit })}</span> : null}
              </div>
              <Stepper label={item.name} size="lg" value={item.qty ?? 0} unit={item.unit ?? undefined} step={item.unit && ['lb', 'kg', 'cup', 'quart'].includes(item.unit) ? 0.5 : 1} onChange={(n) => void run((repo, actor) => setItemQty(repo, item, n, actor))} />
            </div>
          ) : (
            <StatusButtons item={item} size="lg" onSet={(s) => void run((repo, actor) => setItemStatus(repo, item, s, actor))} />
          )}
          {item.useBy ? (
            <div className={`expiry-banner ${horizon === 'expired' ? 'is-expired' : ''}`}>
              <Icon name="clock" />
              <div className="grow">
                {horizon === 'expired' ? `Expired ${formatDate(item.useBy)}. Compost it and mark it Out.` : horizon === 'two_days' ? `Use by ${relativeDay(item.useBy, today)}.` : `Use by ${formatDate(item.useBy, 'weekday')}.`}
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      <div className="section">
        <h3>Prices</h3>
        {prices.length === 0 ? (
          <p className="muted small">No price yet. Scan a receipt or add one under Shop, Price book.</p>
        ) : (
          <div className="list">
            {prices.map(({ retailer, quote }) => (
              <div key={retailer.id} className="list-row">
                <div className="grow row-main">
                  <div className="row-title">{retailer.name}</div>
                  <div className="row-subtitle muted small">
                    {formatDate(quote!.price.observedOn)} {quote!.price.unit ? `per ${quote!.price.unit}` : ''} {quote!.starter ? <Badge tone="low">starter estimate</Badge> : quote!.stale ? <Badge tone="low">7+ days old</Badge> : null}
                  </div>
                </div>
                <div className="num strong">{formatCents(quote!.price.priceCents)}</div>
              </div>
            ))}
          </div>
        )}
        <Link to="/shop/prices" className="small">
          Open the price book
        </Link>
      </div>

      <div className="section">
        <h3>Also called</h3>
        <p className="muted small">Names the parser and receipts learn for this item.</p>
        <div className="row-wrap" style={{ marginBottom: 8 }}>
          {aliases.map((a) => (
            <Badge key={a.id}>{a.alias}</Badge>
          ))}
          {links.map((l) => (
            <Badge key={l.id} tone="accent">
              {data.retailers.find((r) => r.id === l.retailerId)?.name ?? 'Store'}: {l.searchTerm ?? l.externalId}
            </Badge>
          ))}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            if (!aliasText.trim()) return
            void run((repo, actor) => addAlias(repo, item, aliasText, actor))
            setAliasText('')
          }}
        >
          <TextField label="Add another name" value={aliasText} onChange={(e) => setAliasText(e.target.value)} className="grow" placeholder="KRO CHKN THGH" />
          <Button type="submit" variant="secondary" icon="plus" aria-label="Add name" style={{ alignSelf: 'flex-end' }} disabled={!aliasText.trim()}>
            Add
          </Button>
        </form>
      </div>

      <div className="section">
        <h3>History</h3>
        {history.length === 0 ? (
          <p className="muted small">No changes yet.</p>
        ) : (
          <div className="history">
            {history.map((e) => (
              <div key={e.id} className="history-row">
                <span className="history-when">{relativeDay(e.createdAt.slice(0, 10), today)}</span>
                <span>{e.summary}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <Button variant="danger" icon="trash" onClick={() => setConfirmDelete(true)}>
          Remove from pantry
        </Button>
      </div>

      <Sheet
        open={confirmDelete}
        title={`Remove ${item.name}?`}
        onClose={() => setConfirmDelete(false)}
        description="It leaves the pantry and the suggestion engine. You can undo for five seconds, and it stays in the activity feed."
        footer={
          <>
            <Button
              variant="danger"
              size="lg"
              full
              onClick={() => {
                setConfirmDelete(false)
                void run((repo, actor) => removeItem(repo, item, actor)).then(() => navigate('/pantry'))
              }}
            >
              Remove
            </Button>
            <Button size="lg" full onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
          </>
        }
      >
        <p>Nothing else changes. Recipes that use it will show it as missing.</p>
      </Sheet>

      <EditItemSheet key={`${item.id}:${item.updatedAt}`} item={item} open={editing} onClose={() => setEditing(false)} />
    </div>
  )
}

function EditItemSheet({ item, open, onClose }: { item: Item; open: boolean; onClose: () => void }) {
  const data = useHouseholdData()
  const { run } = useUndoable()
  const [name, setName] = useState(item.name)
  const [category, setCategory] = useState<ItemCategory>(item.category)
  const [locationId, setLocationId] = useState(item.locationId ?? '')
  const [mode, setMode] = useState<TrackMode>(item.trackMode)
  const [unit, setUnit] = useState(item.unit ?? '')
  const [par, setPar] = useState(item.par?.toString() ?? '')
  const [useBy, setUseBy] = useState(item.useBy ?? '')
  const [alwaysHave, setAlwaysHave] = useState(item.alwaysHave)
  const [autoList, setAutoList] = useState(item.autoList)
  const [personId, setPersonId] = useState(item.personId ?? '')
  const locations = data.locations.filter((l) => !l.isFreezerShelf)

  const save = () => {
    void run((repo, actor) =>
      updateItem(
        repo,
        item,
        {
          name,
          category,
          locationId: locationId || null,
          trackMode: mode,
          unit: mode === 'count' ? unit || null : null,
          qty: mode === 'count' ? (item.qty ?? (par ? Number(par) : 1)) : null,
          par: mode === 'count' && par ? Number(par) : null,
          useBy: useBy || null,
          alwaysHave,
          autoList,
          personId: personId || null,
        },
        actor,
      ),
    )
    onClose()
  }

  return (
    <Sheet
      open={open}
      title={`Edit ${item.name}`}
      onClose={onClose}
      footer={
        <Button variant="primary" size="lg" full onClick={save} disabled={!name.trim()}>
          Save
        </Button>
      }
    >
      <div className="stack">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value as ItemCategory)}>
          {(Object.keys(CATEGORY_LABEL) as ItemCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Location" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">No location</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </SelectField>
        <Segmented label="Tracking" value={mode} onChange={setMode} options={[{ value: 'status', label: 'OK / Low / Out' }, { value: 'count', label: 'Count' }]} />
        {mode === 'count' ? (
          <div className="grid-2">
            <TextField label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="can, lb, roll" />
            <TextField label="Par level" inputMode="decimal" value={par} onChange={(e) => setPar(e.target.value)} />
          </div>
        ) : null}
        <TextField label="Use by" type="date" value={useBy} onChange={(e) => setUseBy(e.target.value)} />
        <SelectField label="Whose is it" value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">Ours</option>
          {data.persons.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}'s
            </option>
          ))}
        </SelectField>
        <Toggle label="Always have" hint="Recipes never list it as missing." checked={alwaysHave} onChange={setAlwaysHave} />
        <Toggle label="Add to list when Low or Out" checked={autoList} onChange={setAutoList} />
      </div>
    </Sheet>
  )
}
