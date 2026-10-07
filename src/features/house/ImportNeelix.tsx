import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { parseNeelixExport, type NeelixImportPlan } from '@/domain/importers/neelix'
import { newId } from '@/domain/ids'
import { today } from '@/domain/dates'
import { BackHeader } from '@/app/Shell'
import { useSession } from '@/app/session'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useRepo } from '@/data/provider'
import { useActor } from '@/app/hooks/useActions'
import { logEvent } from '@/data/mutations'
import { nowIso } from '@/data/repository'
import { Badge, Button, Card, EmptyState, TextArea } from '@/design/components'

/** Neelix's Kitchen migration: paste or upload the JSON exported from the freezer-partner-state-v1 key, review, import. */
export function ImportNeelix() {
  const { household } = useSession()
  const data = useHouseholdData()
  const repo = useRepo()
  const actor = useActor('import')
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<NeelixImportPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const ctx = useMemo(() => {
    if (!household) return null
    const loc = (kind: string, shelf = false) => data.locations.find((l) => l.kind === kind && l.isFreezerShelf === shelf)?.id ?? null
    return {
      householdId: household.id,
      now: nowIso(),
      today: today(),
      newId,
      locationIds: { pantry: loc('pantry'), fridge: loc('fridge'), freezer: loc('freezer'), freezerShelf: loc('freezer', true), cleaning: loc('cleaning') },
      instacartRetailerId: data.retailers.find((r) => r.kind === 'instacart')?.id ?? data.retailers.find((r) => r.isPrimaryGrocery)?.id ?? null,
    }
  }, [household, data.locations, data.retailers])

  const preview = () => {
    setError(null)
    if (!ctx) return
    try {
      const json = JSON.parse(text) as unknown
      setPlan(parseNeelixExport(json, ctx))
    } catch (e) {
      setError(e instanceof Error ? `Could not read that: ${e.message}` : 'Could not read that.')
      setPlan(null)
    }
  }

  const onFile = async (file: File) => {
    setText(await file.text())
  }

  const commit = async () => {
    if (!plan || !household) return
    setBusy(true)
    try {
      await repo.table('recipes').putMany(plan.recipes.map(({ ingredients: _i, ...r }) => r))
      await repo.table('recipe_ingredients').putMany(plan.recipes.flatMap((r) => r.ingredients))
      await repo.table('items').putMany(plan.items)
      await repo.table('item_aliases').putMany(plan.aliases)
      await repo.table('freezer_blocks').putMany(plan.freezerBlocks)
      await repo.table('list_lines').putMany(plan.listLines)
      await repo.table('prices').putMany(plan.prices)
      await logEvent(repo, household.id, actor, { entityType: 'import', entityId: null, action: 'import', summary: `Imported from Neelix: ${plan.summary}` })
      setDone(plan.summary)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="page">
        <BackHeader title="Import from Neelix" to="/house" />
        <EmptyState icon="check" title="Imported" body={done} action={<Button variant="primary" size="lg" onClick={() => navigate('/cook/recipes')}>Open the recipe bank</Button>} />
      </div>
    )
  }

  return (
    <div className="page">
      <BackHeader title="Import from Neelix" to="/house" />
      <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>
        In Neelix's Kitchen, export the saved state (the <code>freezer-partner-state-v1</code> key) as JSON. Paste it here or pick the file. Nothing is written until you tap Import.
      </p>
      <div className="stack">
        <label className="btn btn-secondary" style={{ alignSelf: 'flex-start' }}>
          Pick a JSON file
          <input type="file" accept="application/json,.json" className="visually-hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f) }} />
        </label>
        <TextArea label="Or paste the JSON" value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder='{"recipes": [...], "pantry": [...]}' error={error ?? undefined} />
        <Button variant="primary" onClick={preview} disabled={!text.trim() || !ctx}>Preview</Button>
      </div>

      {plan ? (
        <div className="section">
          <Card tone="accent">
            <div className="stack">
              <div className="card-title">What will come in</div>
              <div className="row-wrap">
                <Badge tone="accent">{plan.recipes.length} recipes</Badge>
                <Badge tone="accent">{plan.items.length} pantry items</Badge>
                <Badge tone="accent">{plan.freezerBlocks.length} freezer blocks</Badge>
                <Badge tone="accent">{plan.listLines.length} list lines</Badge>
                <Badge tone="accent">{plan.prices.length} prices</Badge>
                <Badge tone="accent">{plan.aliases.length} store names</Badge>
              </div>
              <p className="muted small">{plan.summary}</p>
              {plan.flagged.length > 0 ? (
                <details>
                  <summary>{plan.flagged.length} ingredient lines to fix by hand after import</summary>
                  <ul style={{ paddingLeft: 18, listStyle: 'disc' }}>
                    {plan.flagged.slice(0, 50).map((f, i) => (
                      <li key={i} className="small"><strong>{f.recipeTitle}:</strong> {f.line} <span className="muted">({f.reason})</span></li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {plan.unmapped.length > 0 ? (
                <details>
                  <summary>{plan.unmapped.length} parts of the file were not recognized</summary>
                  <ul style={{ paddingLeft: 18, listStyle: 'disc' }}>
                    {plan.unmapped.slice(0, 20).map((u, i) => (
                      <li key={i} className="small">{u.path}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <Button variant="primary" size="lg" loading={busy} onClick={() => void commit()} disabled={plan.recipes.length + plan.items.length + plan.freezerBlocks.length + plan.prices.length === 0}>
                Import into {household?.name}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
