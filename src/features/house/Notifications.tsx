import { useEffect, useState } from 'react'
import type { NotificationType } from '@/domain/types'
import { BackHeader } from '@/app/Shell'
import { useSession } from '@/app/session'
import { useCollection, useRepo } from '@/data/provider'
import { useUndoable } from '@/app/hooks/useActions'
import { updateHousehold } from './mutations'
import { newId } from '@/domain/ids'
import { pushStatus, subscribe, unsubscribe, type PushStatus } from '@/integrations/push'
import { Card, TextField, Toggle } from '@/design/components'

const STATUS_TEXT: Record<PushStatus, string> = {
  unsupported: 'Not supported in this browser. On an iPhone, add the app to the Home Screen first, then come back here.',
  no_key: 'Push is not set up on this server yet.',
  denied: 'Blocked. Allow notifications for this site in your browser settings, then flip this on.',
  on: 'On. This phone will buzz for the kinds you pick below.',
  off: 'Off. Flip it on and allow notifications when the browser asks.',
}

/** The one toggle that is per phone: a Web Push subscription stored in push_subscriptions. */
function ThisPhoneCard({ localMode }: { localMode: boolean }) {
  const { userId } = useSession()
  const repo = useRepo()
  const [status, setStatus] = useState<PushStatus | 'checking'>('checking')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void pushStatus().then((s) => {
      if (alive) setStatus(s)
    })
    return () => {
      alive = false
    }
  }, [])

  const canToggle = status === 'on' || status === 'off' || status === 'denied'
  const toggle = async (on: boolean) => {
    if (busy) return
    setBusy(true)
    setProblem(null)
    try {
      if (on) await subscribe(repo, userId)
      else await unsubscribe(repo)
      setStatus(await pushStatus())
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.')
      setStatus(await pushStatus())
    } finally {
      setBusy(false)
    }
  }

  const hint = status === 'checking' ? 'Checking this phone...' : STATUS_TEXT[status]
  return (
    <Card>
      <Toggle label="Notifications on this phone" hint={hint} checked={status === 'on'} onChange={(v) => void (canToggle ? toggle(v) : undefined)} />
      <p className="muted small" role="status">
        {problem ?? (localMode ? 'Local mode saves this phone on the device only. Push needs the online account.' : '')}
      </p>
    </Card>
  )
}

const TYPES: { type: NotificationType; title: string; when: string; who: string }[] = [
  { type: 'low_out_daily', title: 'Item hit Low or Out', when: 'Batched, once a day at 5 pm', who: 'Editors and owner' },
  { type: 'expiring_2_days', title: 'Expiring in 2 days', when: 'Morning, 8 am', who: 'Editors and owner' },
  { type: 'expired', title: 'Expired', when: 'Morning, once', who: 'Owner' },
  { type: 'weekly_shop', title: 'Weekly shop reminder', when: 'Your chosen day and time', who: 'Editors and owner' },
  { type: 'cook_week_prep', title: 'Cook-week prep day', when: 'Evening before each cook day', who: 'Whoever is tagged as cook' },
  { type: 'price_book_stale', title: 'Price book stale (7+ days)', when: 'Weekly, with the shop reminder', who: 'Owner' },
  { type: 'budget_80', title: 'Budget at 80%', when: 'On the event', who: 'Owner' },
  { type: 'budget_100', title: 'Budget at 100%', when: 'On the event', who: 'Owner' },
  { type: 'list_sent', title: 'List sent by another member', when: 'Immediately', who: 'Everyone except the sender' },
]

/** Per-user toggles plus the household's quiet hours. Delivery (Web Push) lands in Phase 3; the preferences are stored now. */
export function Notifications() {
  const { household, userId } = useSession()
  const repo = useRepo()
  const { run } = useUndoable()
  const prefs = useCollection('notification_prefs', household?.id)
  const households = useCollection('households', household?.id)
  const row = households.rows.find((h) => h.id === household?.id) ?? null
  const isOwner = household?.role === 'owner'

  const enabled = (t: NotificationType) => prefs.rows.find((p) => p.type === t && p.userId === userId)?.enabled ?? true
  const setEnabled = async (t: NotificationType, v: boolean) => {
    if (!household) return
    const existing = prefs.rows.find((p) => p.type === t && p.userId === userId)
    if (existing) await repo.table('notification_prefs').patch(existing.id, { enabled: v })
    else await repo.table('notification_prefs').put({ id: newId(), householdId: household.id, userId, type: t, enabled: v })
  }

  return (
    <div className="page">
      <BackHeader title="Notifications" to="/house" />
      <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>
        Turn on this phone first, then pick which kinds you want. Every notification opens the screen that fixes it.
      </p>
      <ThisPhoneCard localMode={repo.mode === 'local'} />
      <h3 style={{ marginTop: 'var(--space-4)' }}>Which kinds</h3>
      <Card>
        {TYPES.map((t) => (
          <Toggle key={t.type} label={t.title} hint={`${t.when} · ${t.who}`} checked={enabled(t.type)} onChange={(v) => void setEnabled(t.type, v)} />
        ))}
      </Card>
      {row ? (
        <div className="section">
          <h3>Quiet hours</h3>
          <p className="muted small">Set by the owner for the whole house. Nothing buzzes between these times.</p>
          <div className="grid-2">
            <TextField label="From" type="time" value={row.quietFrom ?? ''} disabled={!isOwner} onChange={(e) => void run((r, actor) => updateHousehold(r, row, { quietFrom: e.target.value || null }, actor, 'Quiet hours changed'))} />
            <TextField label="To" type="time" value={row.quietTo ?? ''} disabled={!isOwner} onChange={(e) => void run((r, actor) => updateHousehold(r, row, { quietTo: e.target.value || null }, actor, 'Quiet hours changed'))} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
