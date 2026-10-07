import { useState } from 'react'
import { BackHeader } from '@/app/Shell'
import { useSession } from '@/app/session'
import { useRepo } from '@/data/provider'
import { TENANT_TABLES } from '@/data/repository'
import { Button, Card, Sheet } from '@/design/components'

/** Download the active household as one JSON file; reset the local demo. */
export function ExportData() {
  const { household } = useSession()
  const repo = useRepo()
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const download = async () => {
    if (!household) return
    setBusy(true)
    try {
      const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), household: await repo.table('households').get(household.id) }
      for (const t of TENANT_TABLES) out[t] = await repo.table(t).list(household.id, { includeDeleted: true })
      out.activity_events = await repo.table('activity_events').list(household.id)
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `quartermaster-${household.name.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <BackHeader title="Export and reset" to="/house" />
      <Card>
        <div className="stack">
          <div className="card-title">Export {household?.name}</div>
          <p className="muted">Everything in this household as one JSON file: pantry, recipes, freezer, plan, list, prices, spend, and the activity log. Plain data, no lock-in.</p>
          <Button variant="primary" size="lg" icon="download" loading={busy} onClick={() => void download()}>
            Download JSON
          </Button>
        </div>
      </Card>
      {repo.mode === 'local' ? (
        <div className="section">
          <Card tone="out">
            <div className="stack">
              <div className="card-title">Reset the demo</div>
              <p className="muted">Local mode only. Wipes this device's data and reseeds Denton and College Station.</p>
              <Button variant="danger" icon="trash" onClick={() => setConfirm(true)}>
                Reset local data
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
      <Sheet open={confirm} title="Reset everything on this device?" onClose={() => setConfirm(false)} footer={<><Button variant="danger" size="lg" full onClick={() => void repo.reset?.().then(() => location.assign('/'))}>Reset</Button><Button size="lg" full onClick={() => setConfirm(false)}>Keep my data</Button></>}>
        <p>Export first if you want to keep anything. This cannot be undone.</p>
      </Sheet>
    </div>
  )
}
