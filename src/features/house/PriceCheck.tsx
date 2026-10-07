import { useState } from 'react'
import { Link } from 'react-router'
import { BackHeader } from '@/app/Shell'
import { useSession } from '@/app/session'
import { useHouseholdData } from '@/app/hooks/useHouseholdData'
import { useCollection } from '@/data/provider'
import { useUndoable } from '@/app/hooks/useActions'
import { updateHousehold } from './mutations'
import { requestPriceCheck, type PriceCheckRun } from '@/integrations/prices/check'
import { formatDate } from '@/domain/dates'
import { Button, Card, Toggle } from '@/design/components'

/** House > Price check: the optional weekly web check for this household's ZIP. Off by default; an owner turns it on.
    Every number it writes carries the page it came from, and anything it could not find stays blank. */
export function PriceCheck() {
  const { household } = useSession()
  const data = useHouseholdData()
  const { run } = useUndoable()
  const households = useCollection('households', household?.id)
  const row = households.rows.find((h) => h.id === household?.id) ?? null
  const canEdit = household?.role === 'owner' || household?.role === 'editor'
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ run: PriceCheckRun | null; error: string | null } | null>(null)

  const setting = row?.settings.priceCheck ?? {}
  const webPrices = data.prices.filter((p) => p.source === 'web').length
  const webRetailers = data.retailers.filter((r) => !r.deletedAt && r.kind !== 'in_person')

  const toggle = (enabled: boolean) => {
    if (!row) return
    void run((r, actor) => updateHousehold(r, row, { settings: { ...row.settings, priceCheck: { ...setting, enabled } } }, actor, enabled ? 'Weekly price check on' : 'Weekly price check off'))
  }

  const checkNow = async () => {
    if (!household) return
    setBusy(true)
    setResult(await requestPriceCheck(household.id))
    households.reload()
    setBusy(false)
  }

  return (
    <div className="page">
      <BackHeader title="Price check" to="/house" />
      <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>
        Once a week, look up shelf prices for this household's items at {webRetailers.map((r) => r.name).join(', ') || 'its retailers'} near ZIP {row?.zip ?? '(not set)'}. Each price it finds is saved with the page it came from. Anything it cannot find stays blank. Receipts and typed prices still win.
      </p>
      {row ? (
        <Card>
          <Toggle
            label="Weekly web check"
            hint={setting.enabled ? 'Runs Monday mornings' : 'Off. The price book uses receipts, typed prices, and starter estimates.'}
            checked={!!setting.enabled}
            onChange={(v) => (canEdit && household?.role === 'owner' ? toggle(v) : undefined)}
          />
          {household?.role !== 'owner' ? <p className="muted small">Only the owner can turn this on or off.</p> : null}
          {!row.zip ? <p className="muted small">Set the household ZIP under House, Edit, before the check can run.</p> : null}
        </Card>
      ) : null}
      <div className="section">
        <h3>Last run</h3>
        <p className="muted small">
          {setting.lastRunAt
            ? `${formatDate(setting.lastRunAt.slice(0, 10), 'long')}: checked ${setting.lastRunChecked ?? 0}, found ${setting.lastRunWritten ?? 0}.`
            : 'Never run.'}{' '}
          {webPrices} {webPrices === 1 ? 'price' : 'prices'} in the book came from the web.
        </p>
        <Button variant="primary" icon="dollar" loading={busy} disabled={!canEdit || !row?.zip} onClick={() => void checkNow()}>
          Check prices now
        </Button>
        {result?.error ? (
          <p className="muted small" role="status" style={{ marginTop: 'var(--space-2)' }}>{result.error}</p>
        ) : result?.run ? (
          <p className="small" role="status" style={{ marginTop: 'var(--space-2)' }}>
            Checked {result.run.checked}, found {result.run.written}, in {result.run.calls} {result.run.calls === 1 ? 'lookup' : 'lookups'}.
            {result.run.skipped.length ? ` ${result.run.skipped.join(' ')}` : ''}
          </p>
        ) : null}
      </div>
      <div className="section">
        <h3>How it works</h3>
        <ul className="muted small">
          <li>Up to 25 items per lookup, one lookup per retailer batch, at most 12 lookups a day per household.</li>
          <li>Only prices found on a page count. Guesses, low-confidence matches, and numbers more than four times the last known price are thrown away.</li>
          <li>Each web price shows its source link in the <Link to="/shop/prices">price book</Link>.</li>
          <li>The lookups run on the server with a Claude key the owner adds to the Supabase project; nothing runs from this phone.</li>
        </ul>
      </div>
    </div>
  )
}
