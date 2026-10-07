// Supabase Edge Function: hourly push notifications (spec: Notifications).
//
// Two ways in:
//   1. Scheduled: a bearer token equal to the service role key (.github/workflows/notify.yml, every hour). Runs every household.
//   2. On demand: a signed-in owner or editor posts { householdId }. Runs that household only (a "send what is due now" tap).
//
// For each household the function works out the local time in the household's timezone, computes what is due with the
// same pure rules the app unit-tests (notifications.ts, a copy of src/domain/notifications.ts), records each dedupe key
// in notification_queue, and sends Web Push to every member in the audience who has that kind on and a phone subscribed.
// "List sent" rows arrive in the queue from a database trigger (0008_notify_queue.sql) and are drained here too.
// Quiet hours hold everything; queued rows wait until they end. A subscription the push service reports gone (404 or 410)
// is deleted. The unique (household_id, dedupe_key) makes a doubled hour or a late catch-up harmless.
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (npx web-push generate-vapid-keys), VAPID_SUBJECT (mailto: or https: URL).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { audienceRoles, dueNotifications, inQuietHours, type Audience, type DueNotification, type LocalNow, type NotificationType, type NotifyItem } from './notifications.ts'

interface QueueRow {
  id: string
  household_id: string
  type: NotificationType
  dedupe_key: string
  title: string
  body: string
  url: string
  audience: Audience
  exclude_user_id: string | null
  status: 'queued' | 'sent' | 'skipped' | 'failed'
}

interface SubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

interface RunResult {
  householdId: string
  due: number
  sent: number
  phones: number
  dropped: number
  held: number
  skipped: string[]
}

const vapid = {
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
  subject: Deno.env.get('VAPID_SUBJECT') ?? '',
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  if (!vapid.publicKey || !vapid.privateKey || !vapid.subject) {
    return json({ error: 'Push is not configured. Add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT to the function secrets.' }, 503)
  }
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const admin = createClient(supabaseUrl, serviceKey)
  let body: { householdId?: string } = {}
  try {
    body = await req.json()
  } catch {
    /* scheduled calls send no body */
  }

  let householdIds: string[] = []
  if (token && token === serviceKey) {
    const { data } = await admin.from('households').select('id').is('deleted_at', null)
    householdIds = (data ?? []).map((h) => h.id as string)
  } else {
    const asUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: userData, error } = await asUser.auth.getUser()
    if (error || !userData.user) return json({ error: 'Not signed in' }, 401)
    if (!body.householdId) return json({ error: 'householdId is required' }, 400)
    const { data: m } = await admin.from('memberships').select('role').eq('household_id', body.householdId).eq('user_id', userData.user.id).is('deleted_at', null).maybeSingle()
    if (!m || !['owner', 'editor'].includes(m.role as string)) return json({ error: 'Only an owner or editor can send notifications now' }, 403)
    householdIds = [body.householdId]
  }

  const results: RunResult[] = []
  for (const hid of householdIds) {
    try {
      results.push(await runHousehold(admin, hid, new Date()))
    } catch (e) {
      results.push({ householdId: hid, due: 0, sent: 0, phones: 0, dropped: 0, held: 0, skipped: [e instanceof Error ? e.message : String(e)] })
    }
  }
  return json({ results })
})

async function runHousehold(admin: SupabaseClient, householdId: string, now: Date): Promise<RunResult> {
  const result: RunResult = { householdId, due: 0, sent: 0, phones: 0, dropped: 0, held: 0, skipped: [] }
  const { data: household } = await admin
    .from('households')
    .select('id, timezone, quiet_from, quiet_to, budget_monthly_cents, budget_warn_pct, settings')
    .eq('id', householdId)
    .single()
  if (!household) {
    result.skipped.push('Household not found')
    return result
  }
  const local = localNow(now, (household.timezone as string) || 'America/Chicago')
  const settings = (household.settings as { weeklyShopDay?: number; weeklyShopTime?: string } | null) ?? {}
  const quiet = { from: timeText(household.quiet_from as string | null), to: timeText(household.quiet_to as string | null) }

  // 1. Work out what is due now and record it.
  const [{ data: items }, { data: spend }, { data: sends }, { data: newestPrice }, { data: recorded }] = await Promise.all([
    admin.from('items').select('id, name, status, use_by, auto_list, deleted_at').eq('household_id', householdId).is('deleted_at', null),
    admin.from('spend').select('amount_cents, kind, occurred_on').eq('household_id', householdId).is('deleted_at', null).gte('occurred_on', `${local.date.slice(0, 7)}-01`),
    admin.from('list_sends').select('status, estimated_total_cents, sent_at').eq('household_id', householdId).is('deleted_at', null).gte('sent_at', `${local.date.slice(0, 7)}-01`),
    admin.from('prices').select('observed_on').eq('household_id', householdId).is('deleted_at', null).order('observed_on', { ascending: false }).limit(1).maybeSingle(),
    admin.from('notification_queue').select('dedupe_key').eq('household_id', householdId),
  ])
  const budget = monthBudget(
    (spend ?? []) as { amount_cents: number; kind: string; occurred_on: string }[],
    (sends ?? []) as { status: string; estimated_total_cents: number | null; sent_at: string }[],
    household.budget_monthly_cents as number | null,
    local.date.slice(0, 7),
  )
  const due = dueNotifications({
    now: local,
    household: {
      quietFrom: quiet.from,
      quietTo: quiet.to,
      budgetWarnPct: (household.budget_warn_pct as number | null) ?? 80,
      weeklyShopDay: typeof settings.weeklyShopDay === 'number' ? settings.weeklyShopDay : null,
      weeklyShopTime: typeof settings.weeklyShopTime === 'string' ? settings.weeklyShopTime : null,
    },
    items: ((items ?? []) as Record<string, unknown>[]).map(
      (i): NotifyItem => ({
        id: i.id as string,
        name: i.name as string,
        status: (i.status as NotifyItem['status']) ?? 'ok',
        useBy: (i.use_by as string | null) ?? null,
        autoList: Boolean(i.auto_list),
        deletedAt: (i.deleted_at as string | null) ?? null,
      }),
    ),
    budgetPct: budget.pct,
    overByCents: budget.overByCents,
    newestPriceOn: (newestPrice?.observed_on as string | undefined) ?? null,
    sentKeys: (recorded ?? []).map((r) => r.dedupe_key as string),
  })
  result.due = due.length
  for (const n of due) await recordDue(admin, householdId, n)

  // 2. Drain everything queued for this household (what we just recorded plus trigger rows), unless it is quiet time.
  if (inQuietHours(local, quiet.from, quiet.to)) {
    const { count } = await admin.from('notification_queue').select('id', { count: 'exact', head: true }).eq('household_id', householdId).eq('status', 'queued')
    result.held = count ?? 0
    return result
  }
  const { data: queued } = await admin.from('notification_queue').select('*').eq('household_id', householdId).eq('status', 'queued').order('created_at')
  if (!queued || queued.length === 0) return result
  const members = await loadMembers(admin, householdId)
  for (const row of queued as QueueRow[]) {
    try {
      const delivered = await deliver(admin, row, members)
      result.sent += 1
      result.phones += delivered.phones
      result.dropped += delivered.dropped
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      result.skipped.push(`${row.dedupe_key}: ${message}`)
      await admin.from('notification_queue').update({ status: 'failed', error: message.slice(0, 500) }).eq('id', row.id).eq('status', 'queued')
    }
  }
  return result
}

/** Insert the main key as queued (skipped silently when another run already has it) and any extra keys as 'skipped'
    so they count as recorded without sending twice. */
async function recordDue(admin: SupabaseClient, householdId: string, n: DueNotification): Promise<void> {
  const [main, ...extra] = n.keys
  const base = { household_id: householdId, type: n.type, title: n.title, body: n.body, url: n.url, audience: n.audience }
  await admin.from('notification_queue').upsert({ ...base, dedupe_key: main, status: 'queued' }, { onConflict: 'household_id,dedupe_key', ignoreDuplicates: true })
  if (extra.length > 0) {
    await admin
      .from('notification_queue')
      .upsert(extra.map((k) => ({ ...base, dedupe_key: k, status: 'skipped' })), { onConflict: 'household_id,dedupe_key', ignoreDuplicates: true })
  }
}

interface Member {
  userId: string
  role: 'owner' | 'editor' | 'viewer' | 'agent'
  /** type -> enabled; missing means on. */
  prefs: Map<string, boolean>
  phones: SubscriptionRow[]
}

async function loadMembers(admin: SupabaseClient, householdId: string): Promise<Member[]> {
  const { data: memberships } = await admin.from('memberships').select('user_id, role').eq('household_id', householdId).is('deleted_at', null)
  const userIds = (memberships ?? []).map((m) => m.user_id as string)
  if (userIds.length === 0) return []
  const [{ data: prefs }, { data: subs }] = await Promise.all([
    admin.from('notification_prefs').select('user_id, type, enabled').eq('household_id', householdId).in('user_id', userIds),
    admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', userIds),
  ])
  return (memberships ?? []).map((m) => ({
    userId: m.user_id as string,
    role: m.role as Member['role'],
    prefs: new Map((prefs ?? []).filter((p) => p.user_id === m.user_id).map((p) => [p.type as string, Boolean(p.enabled)] as const)),
    phones: ((subs ?? []) as SubscriptionRow[]).filter((s) => s.user_id === m.user_id),
  }))
}

/** Send one queued row to its audience and mark it sent. Returns how many phones took it and how many were dropped. */
async function deliver(admin: SupabaseClient, row: QueueRow, members: Member[]): Promise<{ phones: number; dropped: number }> {
  const roles = audienceRoles(row.audience) as readonly string[]
  const targets = members.filter((m) => roles.includes(m.role) && m.userId !== row.exclude_user_id && (m.prefs.get(row.type) ?? true))
  const payload = JSON.stringify({ title: row.title, body: row.body, url: row.url, tag: row.dedupe_key })
  let phones = 0
  let dropped = 0
  for (const m of targets) {
    for (const phone of m.phones) {
      try {
        await webpush.sendNotification({ endpoint: phone.endpoint, keys: { p256dh: phone.p256dh, auth: phone.auth } }, payload, { TTL: 6 * 3600 })
        phones += 1
        await admin.from('push_subscriptions').update({ last_seen_at: new Date().toISOString() }).eq('id', phone.id)
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('id', phone.id)
          m.phones = m.phones.filter((p) => p.id !== phone.id)
          dropped += 1
        } else {
          throw e
        }
      }
    }
  }
  await admin.from('notification_queue').update({ status: 'sent', sent_at: new Date().toISOString(), sent_count: phones, error: null }).eq('id', row.id).eq('status', 'queued')
  return { phones, dropped }
}

/** Spent (actual rows) plus committed (ordered sends' estimates) against the cap, for the month. */
function monthBudget(
  spend: { amount_cents: number; kind: string; occurred_on: string }[],
  sends: { status: string; estimated_total_cents: number | null; sent_at: string }[],
  capCents: number | null,
  month: string,
): { pct: number | null; overByCents: number } {
  if (!capCents || capCents <= 0) return { pct: null, overByCents: 0 }
  let used = 0
  for (const s of spend) if (s.kind === 'actual' && s.occurred_on.slice(0, 7) === month) used += s.amount_cents
  for (const s of sends) if (s.status === 'ordered' && s.sent_at.slice(0, 7) === month) used += s.estimated_total_cents ?? 0
  return { pct: (used / capCents) * 100, overByCents: Math.max(0, used - capCents) }
}

/** Wall-clock parts in a timezone; falls back to UTC on an unknown zone. */
export function localNow(now: Date, timezone: string): LocalNow {
  let fmt: Intl.DateTimeFormat
  try {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })
  } catch {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })
  }
  const parts = Object.fromEntries(fmt.formatToParts(now).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]))
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: weekdays[parts.weekday ?? 'Sun'] ?? 0,
  }
}

/** Postgres `time` arrives as 'HH:MM:SS'; the rules want 'HH:MM'. */
function timeText(t: string | null): string | null {
  return t ? t.slice(0, 5) : null
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
