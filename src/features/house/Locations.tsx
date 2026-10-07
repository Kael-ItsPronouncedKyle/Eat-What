import { useState } from 'react'
import type { Location, LocationKind } from '@/domain/types'
import { BackHeader } from '@/app/Shell'
import { useSession } from '@/app/session'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useUndoable } from '@/app/hooks/useActions'
import { Badge, Button, Card, SelectField, Sheet, TextField } from '@/design/components'
import { addLocation, removeLocation, updateLocation } from './mutations'

const KINDS: { value: LocationKind; label: string }[] = [
  { value: 'pantry', label: 'Pantry' }, { value: 'fridge', label: 'Fridge' }, { value: 'freezer', label: 'Freezer' }, { value: 'cleaning', label: 'Cleaning' },
  { value: 'garage', label: 'Garage' }, { value: 'bathroom', label: 'Bathroom' }, { value: 'custom', label: 'Custom' },
]

export function Locations() {
  const { household } = useSession()
  const data = useHouseholdData()
  const { run } = useUndoable()
  const [editing, setEditing] = useState<Location | null | 'new'>(null)
  const locations = data.locations.slice().sort((a, b) => a.sortOrder - b.sortOrder)
  const countFor = (id: string) => data.items.filter((i) => i.locationId === id).length

  return (
    <div className="page">
      <BackHeader title="Locations" to="/house" right={<Button variant="primary" icon="plus" onClick={() => setEditing('new')}>Add</Button>} />
      <div className="stack">
        {locations.map((l) => (
          <Card key={l.id}>
            <div className="spread">
              <div>
                <div className="card-title">{l.name}</div>
                <div className="row-wrap small muted">
                  <Badge>{KINDS.find((k) => k.value === l.kind)?.label}</Badge>
                  {l.isFreezerShelf ? <Badge tone="accent">freezer shelf</Badge> : <span>{countFor(l.id)} items</span>}
                </div>
              </div>
              {!l.isFreezerShelf ? <Button variant="secondary" icon="edit" onClick={() => setEditing(l)} aria-label={`Edit ${l.name}`}>Edit</Button> : null}
            </div>
          </Card>
        ))}
      </div>
      {editing && household ? (
        <LocationSheet
          location={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(name, kind) => {
            if (editing === 'new') void run((repo, actor) => addLocation(repo, household.id, { name, kind, parentId: null, isFreezerShelf: false, sortOrder: locations.length }, actor))
            else void run((repo, actor) => updateLocation(repo, editing, { name, kind }, actor))
            setEditing(null)
          }}
          onRemove={editing !== 'new' && countFor(editing.id) === 0 ? () => { void run((repo, actor) => removeLocation(repo, editing, actor)); setEditing(null) } : undefined}
        />
      ) : null}
    </div>
  )
}

function LocationSheet({ location, onClose, onSave, onRemove }: { location: Location | null; onClose: () => void; onSave: (name: string, kind: LocationKind) => void; onRemove?: () => void }) {
  const [name, setName] = useState(location?.name ?? '')
  const [kind, setKind] = useState<LocationKind>(location?.kind ?? 'custom')
  return (
    <Sheet open title={location ? `Edit ${location.name}` : 'Add a location'} onClose={onClose} footer={<><Button variant="primary" size="lg" full disabled={!name.trim()} onClick={() => onSave(name.trim(), kind)}>Save</Button>{onRemove ? <Button variant="danger" full onClick={onRemove}>Remove (it is empty)</Button> : null}</>}>
      <div className="stack">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Chest freezer" />
        <SelectField label="Kind" value={kind} onChange={(e) => setKind(e.target.value as LocationKind)}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </SelectField>
      </div>
    </Sheet>
  )
}
