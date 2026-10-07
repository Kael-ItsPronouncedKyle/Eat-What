import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useSession } from '@/app/session'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useCollection, useRepo } from '@/data/provider'
import { useUndoable } from '@/app/hooks/useActions'
import { updateHousehold } from './mutations'
import { formatCents } from '@/domain/money'
import { capacityText } from '@/domain/containers'
import { Button, Icon, ListRow, Sheet, TextField, type IconName } from '@/design/components'

export function HouseHome() {
  const { household, households, switchHousehold } = useSession()
  const data = useHouseholdData()
  const navigate = useNavigate()
  const repo = useRepo()
  const { run } = useUndoable()
  const hh = useCollection('households', household?.id)
  const [editBudget, setEditBudget] = useState(false)
  const [budget, setBudget] = useState('')
  const [zip, setZip] = useState('')
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const row = hh.rows.find((h) => h.id === household?.id) ?? null
  const items: { to: string; icon: IconName; title: string; subtitle: string }[] = [
    { to: '/house/members', icon: 'people', title: 'Members and plates', subtitle: `${data.persons.length} ${data.persons.length === 1 ? 'person' : 'people'}` },
    { to: '/house/rules', icon: 'alert', title: 'Rules', subtitle: `${data.rules.filter((r) => r.active).length} active: allergies, prep, diet, cuisine` },
    { to: '/house/retailers', icon: 'shop', title: 'Retailers and routing', subtitle: data.retailers.map((r) => r.name).join(', ') || 'None yet' },
    { to: '/house/locations', icon: 'pantry', title: 'Locations', subtitle: data.locations.filter((l) => !l.isFreezerShelf).map((l) => l.name).join(', ') },
    { to: '/house/containers', icon: 'snowflake', title: 'Freezer kit', subtitle: data.containers.map((c) => `${c.name}: ${capacityText(c)}`).join(', ') || 'No containers yet' },
    { to: '/house/prices', icon: 'shop', title: 'Price check', subtitle: row?.settings.priceCheck?.enabled ? `Weekly, near ZIP ${row.zip ?? '?'}` : 'Weekly web check, off' },
    { to: '/house/notifications', icon: 'clock', title: 'Notifications', subtitle: row?.quietFrom ? `Quiet ${row.quietFrom} to ${row.quietTo}` : 'Daily and weekly reminders' },
    { to: '/house/activity', icon: 'list', title: 'Activity feed', subtitle: 'Every change, with undo' },
    { to: '/house/display', icon: 'textSize', title: 'Display and access', subtitle: 'Text size, theme, font, handedness' },
    { to: '/house/import', icon: 'upload', title: 'Import from Neelix', subtitle: 'Bring over recipes, pantry, freezer, prices' },
    { to: '/house/export', icon: 'download', title: 'Export and reset', subtitle: 'Download this household as JSON' },
  ]

  return (
    <div className="page">
      <div className="page-title">
        <h1>House</h1>
        {household ? <span className="badge badge-accent role-pill">{household.role}</span> : null}
      </div>
      {row ? (
        <div className="card card-padded" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="spread">
            <div>
              <div className="card-title">{row.name}</div>
              <div className="muted small">
                ZIP {row.zip ?? 'not set'} · Budget {row.budgetMonthlyCents ? `${formatCents(row.budgetMonthlyCents)} a month` : 'not set'} · warn at {row.budgetWarnPct}%
              </div>
            </div>
            {household?.role === 'owner' ? (
              <Button variant="secondary" icon="edit" onClick={() => { setName(row.name); setBudget(row.budgetMonthlyCents ? String(row.budgetMonthlyCents / 100) : ''); setZip(row.zip ?? ''); setEditBudget(true) }}>
                Edit
              </Button>
            ) : null}
          </div>
          {households.length > 1 ? (
            <div className="row-wrap" style={{ marginTop: 'var(--space-3)' }}>
              {households.map((h) => (
                <Button key={h.id} variant={h.id === household?.id ? 'primary' : 'secondary'} size="sm" onClick={() => switchHousehold(h.id)} aria-pressed={h.id === household?.id}>
                  {h.name}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="house-menu">
        {items.map((i) => (
          <ListRow key={i.to} left={<Icon name={i.icon} size="1.5em" />} title={i.title} subtitle={i.subtitle} chevron onClick={() => navigate(i.to)} />
        ))}
      </div>

      <div className="section">
        <Button variant="ghost" icon="plus" onClick={() => setCreating(true)}>
          Start another household
        </Button>
      </div>

      <Sheet
        open={editBudget}
        title="Household settings"
        onClose={() => setEditBudget(false)}
        footer={
          <Button
            variant="primary"
            size="lg"
            full
            disabled={!name.trim()}
            onClick={() => {
              if (!row) return
              const cents = budget.trim() ? Math.round(Number(budget) * 100) : null
              void run((r, actor) => updateHousehold(r, row, { name: name.trim(), zip: zip.trim() || null, budgetMonthlyCents: Number.isFinite(cents as number) ? cents : null }, actor, 'Updated household settings'))
              setEditBudget(false)
            }}
          >
            Save
          </Button>
        }
      >
        <div className="stack">
          <TextField label="Household name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="ZIP (for the price book)" inputMode="numeric" value={zip} onChange={(e) => setZip(e.target.value)} />
          <TextField label="Monthly budget (dollars)" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} hint="Warns at 80%, red at 100%, never blocks a send." />
        </div>
      </Sheet>

      <Sheet
        open={creating}
        title="New household"
        onClose={() => setCreating(false)}
        footer={
          <Button
            variant="primary"
            size="lg"
            full
            disabled={!newName.trim()}
            onClick={() => {
              void repo.createHousehold({ name: newName.trim(), kit: 'basic' }).then(() => { setCreating(false); setNewName('') })
            }}
          >
            Create and switch
          </Button>
        }
      >
        <div className="stack">
          <p className="muted">It starts empty with default locations and a basic freezer kit. Invite members from the Members screen.</p>
          <TextField label="Name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Lake house" />
        </div>
      </Sheet>
    </div>
  )
}
