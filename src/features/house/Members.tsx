import { useState } from 'react'
import type { Person, Role } from '@/domain/types'
import { BackHeader } from '@/app/Shell'
import { useSession } from '@/app/session'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useUndoable } from '@/app/hooks/useActions'
import { useCollection, useRepo } from '@/data/provider'
import { Badge, Button, Card, Segmented, SelectField, Sheet, TextField } from '@/design/components'
import { copyText } from '@/integrations/share'
import { addPerson, removePerson, updatePerson } from './mutations'

export function Members() {
  const { household, userId } = useSession()
  const data = useHouseholdData()
  const repo = useRepo()
  const { run } = useUndoable()
  const members = useCollection('memberships', household?.id)
  const profiles = useCollection('profiles', household?.id)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteKind, setInviteKind] = useState<'member' | 'household'>('member')
  const [inviteRole, setInviteRole] = useState<Role>('editor')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [editing, setEditing] = useState<Person | null>(null)
  const [adding, setAdding] = useState(false)

  const isOwner = household?.role === 'owner'
  const link = token ? `${typeof location !== 'undefined' ? location.origin : ''}${import.meta.env.BASE_URL.replace(/\/$/, '')}/join/${token}` : null

  return (
    <div className="page">
      <BackHeader title="Members and plates" to="/house" right={isOwner ? <Button variant="primary" icon="plus" onClick={() => { setToken(null); setInviteOpen(true) }}>Invite</Button> : undefined} />
      <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>
        People in this house. Each person can have a plate profile so cook mode prints the right plating note.
      </p>
      <div className="stack">
        {data.persons.sort((a, b) => a.sortOrder - b.sortOrder).map((p) => {
          const m = members.rows.find((x) => x.personId === p.id || (p.userId && x.userId === p.userId))
          const profile = profiles.rows.find((x) => x.userId === p.userId)
          return (
            <Card key={p.id}>
              <div className="spread">
                <div>
                  <div className="card-title">
                    {p.name} {p.userId === userId ? <span className="muted small">(you)</span> : null}
                  </div>
                  <div className="row-wrap small muted" style={{ marginTop: 4 }}>
                    {m ? <Badge tone="accent" ><span className="role-pill">{m.role}</span></Badge> : <Badge>no sign-in</Badge>}
                    {profile?.email ? <span>{profile.email}</span> : null}
                    {p.plateProfile.richness ? <Badge>{p.plateProfile.richness} plate</Badge> : null}
                    {p.plateProfile.portionMultiplier && p.plateProfile.portionMultiplier !== 1 ? <Badge>{Math.round(p.plateProfile.portionMultiplier * 100)}% portion</Badge> : null}
                  </div>
                  {p.plateProfile.notes ? <p className="small" style={{ marginTop: 6 }}>{p.plateProfile.notes}</p> : null}
                </div>
                <Button variant="secondary" icon="edit" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}>
                  Edit
                </Button>
              </div>
            </Card>
          )
        })}
      </div>
      <div className="section">
        <Button variant="ghost" icon="plus" onClick={() => setAdding(true)}>
          Add a person without a sign-in (a kid, a guest cook)
        </Button>
      </div>

      <Sheet
        open={inviteOpen}
        title="Invite"
        onClose={() => setInviteOpen(false)}
        description="A one-time link. In local mode it only works on this device; with Supabase it is a real link you can text or email."
        footer={
          token ? (
            <Button variant="primary" size="lg" full icon="copy" onClick={() => void copyText(link!)}>
              Copy link
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              full
              onClick={() => {
                if (!household) return
                void repo
                  .createInvite({ householdId: household.id, kind: inviteKind, email: inviteEmail.trim() || null, role: inviteRole, newHouseholdName: inviteKind === 'household' ? inviteName.trim() || null : null })
                  .then(setToken)
              }}
            >
              Make the link
            </Button>
          )
        }
      >
        <div className="stack">
          <Segmented
            label="What kind of invite"
            value={inviteKind}
            onChange={setInviteKind}
            options={[
              { value: 'member', label: 'Join this house' },
              { value: 'household', label: 'Start their own' },
            ]}
          />
          {inviteKind === 'member' ? (
            <SelectField label="Role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
              <option value="editor">Editor: add, edit, cook, send lists</option>
              <option value="viewer">Viewer: read only</option>
              <option value="owner">Owner: everything, including members</option>
              <option value="agent">Agent (Riker): drafts only, never sends</option>
            </SelectField>
          ) : (
            <TextField label="Their household name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="College Station" />
          )}
          <TextField label="Email (optional, locks the link to them)" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          {link ? <div className="invite-box" aria-live="polite">{link}</div> : null}
        </div>
      </Sheet>

      {editing ? <PersonSheet person={editing} onClose={() => setEditing(null)} onSave={(patch) => { void run((r, actor) => updatePerson(r, editing, patch, actor)); setEditing(null) }} onRemove={() => { void run((r, actor) => removePerson(r, editing, actor)); setEditing(null) }} /> : null}
      {adding && household ? (
        <PersonSheet
          person={null}
          onClose={() => setAdding(false)}
          onSave={(patch) => {
            void run((r, actor) => addPerson(r, household.id, { name: patch.name ?? 'Someone', userId: null, plateProfile: patch.plateProfile ?? {}, color: null, sortOrder: data.persons.length }, actor))
            setAdding(false)
          }}
        />
      ) : null}
    </div>
  )
}

function PersonSheet({ person, onClose, onSave, onRemove }: { person: Person | null; onClose: () => void; onSave: (patch: Partial<Person>) => void; onRemove?: () => void }) {
  const [name, setName] = useState(person?.name ?? '')
  const [richness, setRichness] = useState<'lighter' | 'standard' | 'richer'>(person?.plateProfile.richness ?? 'standard')
  const [volume, setVolume] = useState<'smaller' | 'standard' | 'larger'>(person?.plateProfile.volume ?? 'standard')
  const [mult, setMult] = useState(String(person?.plateProfile.portionMultiplier ?? 1))
  const [notes, setNotes] = useState(person?.plateProfile.notes ?? '')
  return (
    <Sheet
      open
      title={person ? `Edit ${person.name}` : 'Add a person'}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" size="lg" full disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), plateProfile: { richness, volume, portionMultiplier: Number(mult) || 1, notes: notes.trim() || undefined } })}>
            Save
          </Button>
          {person && onRemove && !person.userId ? (
            <Button variant="danger" size="md" full onClick={onRemove}>
              Remove {person.name}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="stack">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Segmented label="Richness" value={richness} onChange={setRichness} options={[{ value: 'lighter', label: 'Lighter' }, { value: 'standard', label: 'Standard' }, { value: 'richer', label: 'Richer' }]} />
        <Segmented label="Volume" value={volume} onChange={setVolume} options={[{ value: 'smaller', label: 'Smaller' }, { value: 'standard', label: 'Standard' }, { value: 'larger', label: 'Larger' }]} />
        <TextField label="Portion multiplier" inputMode="decimal" value={mult} onChange={(e) => setMult(e.target.value)} hint="1 is the recipe's serving. 0.8 is a smaller plate, 1.2 a bigger one." />
        <TextField label="Plating note" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Lighter, higher-volume plate." />
      </div>
    </Sheet>
  )
}
