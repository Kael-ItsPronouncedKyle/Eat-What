import { useState } from 'react'
import { useRepo } from '@/data/provider'
import { Button, Card, Segmented, TextField } from '@/design/components'
import type { Kit } from '@/data/seed/defaults'
import './auth.css'

/** Shown when the signed-in user belongs to no household: name it, pick a freezer kit, go. Members, retailers and rules follow under House. */
export function FirstRun({ onDone }: { onDone: () => void }) {
  const repo = useRepo()
  const [name, setName] = useState('')
  const [zip, setZip] = useState('')
  const [kit, setKit] = useState<Kit>('basic')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="auth">
      <form
        className="auth-card"
        onSubmit={(e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          repo
            .createHousehold({ name: name.trim(), zip: zip.trim() || null, kit, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago' })
            .then(onDone)
            .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
            .finally(() => setBusy(false))
        }}
      >
        <h1>Set up your house</h1>
        <p className="muted">Three questions. Members, stores, allergies and the starter pantry come next under House.</p>
        <TextField label="Household name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Denton" autoFocus required />
        <TextField label="ZIP (for prices)" inputMode="numeric" value={zip} onChange={(e) => setZip(e.target.value)} />
        <Card>
          <Segmented<Kit> label="Freezer kit" value={kit} onChange={setKit} options={[{ value: 'souper_cubes', label: 'Souper Cubes' }, { value: 'cheapest', label: 'Bags and tubs' }, { value: 'basic', label: 'Basic' }]} />
          <p className="small muted" style={{ marginTop: 8 }}>You can change containers any time under House, Freezer kit.</p>
        </Card>
        {error ? <p className="field-error small">{error}</p> : null}
        <Button type="submit" variant="primary" size="lg" full loading={busy} disabled={!name.trim()}>Create {name.trim() || 'the household'}</Button>
      </form>
    </div>
  )
}
