import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import type { ItemCategory, TrackMode } from '@/domain/types'
import { CATEGORY_LABEL } from '@/domain/types'
import { parseQuantity } from '@/domain/units'
import { findItemByName } from '@/domain/matching'
import { BackHeader } from '@/app/Shell'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useUndoable } from '@/app/hooks/useActions'
import { useToday } from '@/app/hooks/useToday'
import { Button, Segmented, SelectField, TextField, Toggle } from '@/design/components'
import { addItem } from './mutations'

const CATEGORIES = Object.keys(CATEGORY_LABEL) as ItemCategory[]

/** Add by name. "2 cans black beans" fills the amount, unit, and name; a close match to an existing item is offered first. */
export function AddItem() {
  const data = useHouseholdData()
  const today = useToday()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { run } = useUndoable()
  const [text, setText] = useState(params.get('name') ?? '')
  const [category, setCategory] = useState<ItemCategory>('pantry')
  const [locationId, setLocationId] = useState<string>('')
  const [mode, setMode] = useState<TrackMode>('status')
  const [par, setPar] = useState('')
  const [useBy, setUseBy] = useState('')
  const [alwaysHave, setAlwaysHave] = useState(false)
  const [saving, setSaving] = useState(false)

  const parsed = useMemo(() => {
    const p = safeParse(text)
    return p ?? { amount: null, unit: null, rest: text.trim() }
  }, [text])
  const existing = useMemo(() => {
    if (!parsed.rest) return null
    try {
      const m = findItemByName(parsed.rest, { items: data.items, aliases: data.item_aliases, alwaysHave: data.alwaysHave })
      return m.itemId ? (data.items.find((i) => i.id === m.itemId) ?? null) : null
    } catch {
      return null
    }
  }, [parsed.rest, data.items, data.item_aliases, data.alwaysHave])

  const locations = data.locations.filter((l) => !l.isFreezerShelf).sort((a, b) => a.sortOrder - b.sortOrder)
  const [modeTouched, setModeTouched] = useState(false)
  const effectiveMode: TrackMode = parsed.amount !== null && !modeTouched ? 'count' : mode

  const save = async () => {
    if (!data.householdId || !parsed.rest) return
    setSaving(true)
    try {
      const r = await run((repo, actor) =>
        addItem(
          repo,
          {
            householdId: data.householdId!,
            name: parsed.rest,
            category,
            locationId: locationId || (locations[0]?.id ?? null),
            trackMode: effectiveMode,
            qty: parsed.amount,
            unit: parsed.unit,
            par: par ? Number(par) : null,
            useBy: useBy || null,
            alwaysHave,
            today,
          },
          actor,
        ),
      )
      navigate(`/pantry/item/${r.item.id}`, { replace: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <BackHeader title="Add item" to="/pantry" />
      <form
        className="stack-lg"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <TextField
          label="What is it?"
          placeholder="2 cans black beans"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          hint={parsed.amount !== null ? `Reads as ${parsed.amount} ${parsed.unit ?? ''} of "${parsed.rest}"`.replace(/\s+/g, ' ') : 'You can type an amount first, like "3 lb chicken thighs".'}
        />
        {existing ? (
          <div className="card card-accent card-padded">
            <div className="spread">
              <div>
                <strong>{existing.name}</strong> is already in the pantry.
              </div>
              <Button variant="primary" onClick={() => navigate(`/pantry/item/${existing.id}`)}>
                Open it
              </Button>
            </div>
          </div>
        ) : null}
        <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value as ItemCategory)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Where it lives" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </SelectField>
        <Segmented
          label="How to track it"
          value={effectiveMode}
          onChange={(m) => { setMode(m); setModeTouched(true) }}
          options={[
            { value: 'status', label: 'OK / Low / Out', description: 'Best for staples' },
            { value: 'count', label: 'Count', description: 'Cans, pounds, rolls' },
          ]}
        />
        {effectiveMode === 'count' ? (
          <TextField label={`Par level${parsed.unit ? ` (${parsed.unit})` : ''}`} inputMode="decimal" placeholder="Reorder when below" value={par} onChange={(e) => setPar(e.target.value)} />
        ) : null}
        <TextField label="Use by (optional)" type="date" value={useBy} onChange={(e) => setUseBy(e.target.value)} hint="Left blank, it gets a default from the category." />
        <Toggle label="Always have" hint="Pantry assumptions like salt and oil. Recipes never list them as missing." checked={alwaysHave} onChange={setAlwaysHave} />
        <div className="sticky-actions">
          <Button type="submit" variant="primary" size="lg" disabled={!parsed.rest || saving} loading={saving} icon="plus">
            Add {parsed.rest ? `"${parsed.rest}"` : 'item'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function safeParse(text: string) {
  try {
    return parseQuantity(text)
  } catch {
    return null
  }
}
