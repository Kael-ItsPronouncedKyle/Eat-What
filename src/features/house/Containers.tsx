import { useState } from 'react'
import type { Container, ContainerKind } from '@/domain/types'
import { BackHeader } from '@/app/Shell'
import { useSession } from '@/app/session'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useUndoable } from '@/app/hooks/useActions'
import { kitContainers, type Kit } from '@/data/seed/defaults'
import { Badge, Button, Card, SelectField, Sheet, Stepper, TextField, Toggle } from '@/design/components'
import { addContainer, removeContainer, updateContainer } from './mutations'
import { combineUndoables } from '@/data/mutations'
import { capacityText, cavitiesOf } from '@/domain/containers'

const KINDS: { value: ContainerKind; label: string }[] = [
  { value: 'tray', label: 'Silicone tray (Souper Cubes)' }, { value: 'bag', label: 'Zip bag' }, { value: 'tub', label: 'Tub or deli quart' }, { value: 'pan', label: 'Foil or loaf pan' },
  { value: 'jar', label: 'Mason jar' }, { value: 'muffin_tin', label: 'Muffin tin' }, { value: 'other', label: 'Other' },
]

/** The household's freezer kit: what they own, how many, what it fits, and whether it goes in the oven or microwave. */
export function Containers() {
  const { household } = useSession()
  const data = useHouseholdData()
  const { run } = useUndoable()
  const [editing, setEditing] = useState<Container | null | 'new'>(null)
  const containers = data.containers.slice().sort((a, b) => a.sortOrder - b.sortOrder)

  const addPreset = (kit: Kit) => {
    if (!household) return
    const toAdd = kitContainers(household.id, kit).filter((c) => !containers.some((x) => x.name === c.name))
    if (toAdd.length === 0) return
    void run(async (repo, actor) => {
      const parts = []
      for (const [i, c] of toAdd.entries()) parts.push(await addContainer(repo, household.id, { name: c.name, kind: c.kind, capacityMl: c.capacityMl, countOwned: c.countOwned, cavities: c.cavities, disposable: c.disposable, ovenSafe: c.ovenSafe, microwaveSafe: c.microwaveSafe, sortOrder: containers.length + i }, actor))
      return combineUndoables(parts, `Added ${parts.length} containers from the preset`)
    })
  }

  return (
    <div className="page">
      <BackHeader title="Freezer kit" to="/house" right={<Button variant="primary" icon="plus" onClick={() => setEditing('new')}>Add</Button>} />
      <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>
        Souper Cubes are one kind of container, not the model. Count the trays you own and how many portions each holds; the cook-week planner warns when a day needs more.
      </p>
      <div className="stack">
        {containers.map((c) => (
          <Card key={c.id}>
            <div className="spread">
              <div>
                <div className="card-title">{c.name}</div>
                <div className="row-wrap small muted" style={{ marginTop: 4 }}>
                  <Badge>{KINDS.find((k) => k.value === c.kind)?.label}</Badge>
                  <span>{Math.round(c.capacityMl)} ml ({(c.capacityMl / 240).toFixed(c.capacityMl % 240 === 0 ? 0 : 1)} cups) each</span>
                  {c.disposable ? <Badge>disposable</Badge> : null}
                  {c.ovenSafe ? <Badge tone="ok">oven</Badge> : null}
                  {c.microwaveSafe ? <Badge tone="ok">microwave</Badge> : null}
                </div>
                <div className="small" style={{ marginTop: 4 }} role="status">{capacityText(c)}</div>
              </div>
              <Button variant="ghost" icon="edit" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)} />
            </div>
            <div className="grid-2" style={{ marginTop: 'var(--space-3)' }}>
              <div className="stack" style={{ gap: 4 }}>
                <span className="small muted">Owned</span>
                <Stepper label={`${c.name} owned`} value={c.countOwned} onChange={(n) => void run((repo, actor) => updateContainer(repo, c, { countOwned: Math.max(0, Math.round(n)) }, actor))} />
              </div>
              <div className="stack" style={{ gap: 4 }}>
                <span className="small muted">Cavities each</span>
                <Stepper label={`${c.name} cavities`} min={1} value={cavitiesOf(c)} onChange={(n) => void run((repo, actor) => updateContainer(repo, c, { cavities: Math.max(1, Math.round(n)) }, actor))} />
              </div>
            </div>
          </Card>
        ))}
      </div>
      <div className="section">
        <h3>Presets</h3>
        <div className="row-wrap">
          <Button onClick={() => addPreset('souper_cubes')}>Souper Cubes set</Button>
          <Button onClick={() => addPreset('cheapest')}>Cheapest kit (bags, muffin tin, tubs)</Button>
          <Button onClick={() => addPreset('basic')}>Basic (bags, deli quarts, foil pans)</Button>
        </div>
      </div>
      {editing && household ? (
        <ContainerSheet
          container={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(c) => {
            if (editing === 'new') void run((repo, actor) => addContainer(repo, household.id, { ...c, sortOrder: containers.length }, actor))
            else void run((repo, actor) => updateContainer(repo, editing, c, actor))
            setEditing(null)
          }}
          onRemove={editing !== 'new' ? () => { void run((repo, actor) => removeContainer(repo, editing, actor)); setEditing(null) } : undefined}
        />
      ) : null}
    </div>
  )
}

function ContainerSheet({ container, onClose, onSave, onRemove }: { container: Container | null; onClose: () => void; onSave: (c: Omit<Container, 'id' | 'householdId' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'deletedAt' | 'sortOrder'>) => void; onRemove?: () => void }) {
  const [name, setName] = useState(container?.name ?? '')
  const [kind, setKind] = useState<ContainerKind>(container?.kind ?? 'bag')
  const [cups, setCups] = useState(container ? String(Math.round((container.capacityMl / 240) * 100) / 100) : '4')
  const [count, setCount] = useState(container?.countOwned ?? 10)
  const [cavities, setCavities] = useState(container ? cavitiesOf(container) : 1)
  const [disposable, setDisposable] = useState(container?.disposable ?? false)
  const [oven, setOven] = useState(container?.ovenSafe ?? false)
  const [micro, setMicro] = useState(container?.microwaveSafe ?? false)
  return (
    <Sheet open title={container ? `Edit ${container.name}` : 'Add a container'} onClose={onClose} footer={<><Button variant="primary" size="lg" full disabled={!name.trim() || !(Number(cups) > 0)} onClick={() => onSave({ name: name.trim(), kind, capacityMl: Math.round(Number(cups) * 240), countOwned: count, cavities, disposable, ovenSafe: oven, microwaveSafe: micro })}>Save</Button>{onRemove ? <Button variant="danger" full onClick={onRemove}>Remove</Button> : null}</>}>
      <div className="stack">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Quart zip bag" />
        <SelectField label="Kind" value={kind} onChange={(e) => setKind(e.target.value as ContainerKind)}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </SelectField>
        <TextField label="Each portion holds (cups)" inputMode="decimal" value={cups} onChange={(e) => setCups(e.target.value)} hint="A quart is 4 cups; one cavity of a 2-cup Souper Cubes tray is 2." />
        <div className="spread"><span>How many you own</span><Stepper label="Owned" value={count} onChange={(n) => setCount(Math.max(0, Math.round(n)))} /></div>
        <div className="spread"><span>Portions each holds at once</span><Stepper label="Cavities" min={1} value={cavities} onChange={(n) => setCavities(Math.max(1, Math.round(n)))} /></div>
        <p className="small muted" role="status">{capacityText({ countOwned: count, cavities, kind, disposable })}. A 2-cup Souper Cubes tray has 4 cavities, a 1-cup tray 6, a 1/2-cup tray 8. Bags, tubs and jars are 1.</p>
        <Toggle label="Disposable (bags, foil)" checked={disposable} onChange={setDisposable} />
        <Toggle label="Oven safe" checked={oven} onChange={setOven} />
        <Toggle label="Microwave safe" checked={micro} onChange={setMicro} />
      </div>
    </Sheet>
  )
}
