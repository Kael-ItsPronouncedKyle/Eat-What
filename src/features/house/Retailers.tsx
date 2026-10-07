import { useState } from 'react'
import type { ItemCategory, Retailer, RetailerKind } from '@/domain/types'
import { CATEGORY_LABEL, FOOD_CATEGORIES } from '@/domain/types'
import { BackHeader } from '@/app/Shell'
import { useSession } from '@/app/session'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useUndoable } from '@/app/hooks/useActions'
import { Badge, Button, Card, SelectField, Sheet, TextField, Toggle } from '@/design/components'
import { addRetailer, addRoutingRule, removeRetailer, removeRoutingRule, updateRetailer, updateRoutingRule } from './mutations'
import { combineUndoables } from '@/data/mutations'

const KINDS: { value: RetailerKind; label: string }[] = [
  { value: 'instacart', label: 'Instacart' }, { value: 'heb', label: 'H-E-B' }, { value: 'kroger', label: 'Kroger' }, { value: 'walmart', label: 'Walmart' },
  { value: 'amazon', label: 'Amazon' }, { value: 'in_person', label: 'In person' }, { value: 'other', label: 'Other' },
]

export function Retailers() {
  const { household } = useSession()
  const data = useHouseholdData()
  const { run } = useUndoable()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Retailer | null>(null)
  const isOwner = household?.role === 'owner'
  const retailers = data.retailers.slice().sort((a, b) => a.sortOrder - b.sortOrder)
  const categories = Object.keys(CATEGORY_LABEL) as ItemCategory[]
  const ruleFor = (c: ItemCategory) => data.routing_rules.find((r) => r.matchKind === 'category' && r.matchValue === c) ?? null
  const primaryGrocery = retailers.find((r) => r.isPrimaryGrocery) ?? null
  const primaryOther = retailers.find((r) => r.isPrimaryOther) ?? null

  const setCategoryRoute = (c: ItemCategory, retailerId: string) => {
    if (!household) return
    const existing = ruleFor(c)
    const name = retailers.find((r) => r.id === retailerId)?.name ?? ''
    if (!retailerId) {
      if (existing) void run((repo, actor) => removeRoutingRule(repo, existing, actor, `${CATEGORY_LABEL[c]} now follows the default store`))
      return
    }
    if (existing) void run((repo, actor) => updateRoutingRule(repo, existing, { retailerId }, actor, `${CATEGORY_LABEL[c]} now goes to ${name}`))
    else void run((repo, actor) => addRoutingRule(repo, household.id, { matchKind: 'category', matchValue: c, retailerId, priority: 0 }, actor, `${CATEGORY_LABEL[c]} now goes to ${name}`))
  }

  return (
    <div className="page">
      <BackHeader title="Retailers and routing" to="/house" right={isOwner ? <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>Add</Button> : undefined} />
      <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>
        Every list line gets a destination from these rules, so paper towels go to Amazon without a thought.
      </p>
      <div className="stack">
        {retailers.map((r) => (
          <Card key={r.id} tone={r.isPrimaryGrocery || r.isPrimaryOther ? 'accent' : 'neutral'}>
            <div className="spread">
              <div>
                <div className="card-title">{r.name}</div>
                <div className="row-wrap small muted" style={{ marginTop: 4 }}>
                  <Badge>{KINDS.find((k) => k.value === r.kind)?.label ?? r.kind}</Badge>
                  {r.isPrimaryGrocery ? <Badge tone="ok">default for food</Badge> : null}
                  {r.isPrimaryOther ? <Badge tone="ok">default for everything else</Badge> : null}
                  {r.config.storeName ? <span>{r.config.storeName}</span> : null}
                  {r.config.zip ? <span>ZIP {r.config.zip}</span> : null}
                </div>
              </div>
              {isOwner ? <Button variant="secondary" icon="edit" onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`}>Edit</Button> : null}
            </div>
          </Card>
        ))}
      </div>

      <div className="section">
        <h3>Where each category goes</h3>
        <p className="muted small">Food defaults to {primaryGrocery?.name ?? 'your grocery store'}; everything else to {primaryOther?.name ?? 'your other store'}. Override any category here. Per-item overrides live on the item.</p>
        <div className="stack">
          {categories.map((c) => {
            const rule = ruleFor(c)
            const fallback = FOOD_CATEGORIES.includes(c) ? primaryGrocery : primaryOther
            return (
              <SelectField key={c} label={CATEGORY_LABEL[c]} value={rule?.retailerId ?? ''} onChange={(e) => setCategoryRoute(c, e.target.value)}>
                <option value="">Default ({fallback?.name ?? 'none'})</option>
                {retailers.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </SelectField>
            )
          })}
        </div>
      </div>

      {(adding || editing) && household ? (
        <RetailerSheet
          retailer={editing}
          onClose={() => { setAdding(false); setEditing(null) }}
          onSave={(patch) => {
            void run(async (repo, actor) => {
              const parts = []
              if (editing) parts.push(await updateRetailer(repo, editing, patch, actor))
              else parts.push(await addRetailer(repo, household.id, { name: patch.name ?? 'Store', kind: patch.kind ?? 'other', config: patch.config ?? {}, isPrimaryGrocery: patch.isPrimaryGrocery ?? false, isPrimaryOther: patch.isPrimaryOther ?? false, sortOrder: retailers.length }, actor))
              // Only one primary of each kind; all of it is one undo.
              if (patch.isPrimaryGrocery) for (const r of retailers) if (r.id !== editing?.id && r.isPrimaryGrocery) parts.push(await updateRetailer(repo, r, { isPrimaryGrocery: false }, actor, `${r.name} is no longer the food default`))
              if (patch.isPrimaryOther) for (const r of retailers) if (r.id !== editing?.id && r.isPrimaryOther) parts.push(await updateRetailer(repo, r, { isPrimaryOther: false }, actor, `${r.name} is no longer the other default`))
              return combineUndoables(parts, editing ? `Updated ${patch.name ?? editing.name}` : `Added ${patch.name ?? 'a store'}`)
            })
            setAdding(false); setEditing(null)
          }}
          onRemove={editing ? () => { void run((repo, actor) => removeRetailer(repo, editing, actor)); setEditing(null) } : undefined}
        />
      ) : null}
    </div>
  )
}

function RetailerSheet({ retailer, onClose, onSave, onRemove }: { retailer: Retailer | null; onClose: () => void; onSave: (patch: Partial<Retailer>) => void; onRemove?: () => void }) {
  const [name, setName] = useState(retailer?.name ?? '')
  const [kind, setKind] = useState<RetailerKind>(retailer?.kind ?? 'instacart')
  const [storeName, setStoreName] = useState(retailer?.config.storeName ?? '')
  const [zip, setZip] = useState(retailer?.config.zip ?? '')
  const [tag, setTag] = useState(retailer?.config.affiliateTag ?? '')
  const [grocery, setGrocery] = useState(retailer?.isPrimaryGrocery ?? false)
  const [other, setOther] = useState(retailer?.isPrimaryOther ?? false)
  return (
    <Sheet
      open
      title={retailer ? `Edit ${retailer.name}` : 'Add a retailer'}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" size="lg" full disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), kind, config: { ...(retailer?.config ?? {}), storeName: storeName.trim() || undefined, zip: zip.trim() || undefined, affiliateTag: tag.trim() || undefined }, isPrimaryGrocery: grocery, isPrimaryOther: other })}>
            Save
          </Button>
          {onRemove ? <Button variant="danger" full onClick={onRemove}>Remove</Button> : null}
        </>
      }
    >
      <div className="stack">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Instacart (Kroger)" />
        <SelectField label="Kind" value={kind} onChange={(e) => setKind(e.target.value as RetailerKind)}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </SelectField>
        {kind === 'instacart' || kind === 'heb' || kind === 'kroger' ? <TextField label="Store" value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Kroger" /> : null}
        <TextField label="ZIP" inputMode="numeric" value={zip} onChange={(e) => setZip(e.target.value)} />
        {kind === 'amazon' ? <TextField label="Associate tag (optional)" value={tag} onChange={(e) => setTag(e.target.value)} hint="Not a secret. Keys never live in the app." /> : null}
        <Toggle label="Default for food" checked={grocery} onChange={setGrocery} />
        <Toggle label="Default for everything else" checked={other} onChange={setOther} />
      </div>
    </Sheet>
  )
}
