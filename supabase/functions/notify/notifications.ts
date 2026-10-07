/* Which notifications are due right now (spec: Notifications). Pure and self-contained: no imports, so the notify edge
   function (supabase/functions/notify/notifications.ts) carries an identical copy. Keep the two files the same.

   Every notification carries dedupe keys. The sender records each key once (notification_queue has a unique key per
   household), so an hourly run that fires twice, or a catch-up run three hours late, never sends the same thing twice.
   Quiet hours hold everything; time-of-day rules have a short catch-up window so a late run still delivers. */

export const NOTIFICATION_TYPES = [
  'low_out_daily', 'expiring_2_days', 'expired', 'weekly_shop', 'cook_week_prep', 'price_book_stale', 'budget_80', 'budget_100', 'list_sent',
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

/** Who a notification goes to (spec table). Owners count as editors. */
export type Audience = 'owner' | 'editors' | 'all_but_sender'

export interface LocalNow {
  /** YYYY-MM-DD in the household's timezone. */
  date: string
  /** 0 to 23 in the household's timezone. */
  hour: number
  minute: number
  /** 0 = Sunday, in the household's timezone. */
  weekday: number
}

export interface NotifyHousehold {
  quietFrom: string | null
  quietTo: string | null
  budgetWarnPct: number | null
  weeklyShopDay: number | null
  /** 'HH:MM'; defaults to 09:00 when a day is set without a time. */
  weeklyShopTime: string | null
}

export interface NotifyItem {
  id: string
  name: string
  status: 'ok' | 'low' | 'out'
  /** YYYY-MM-DD or null. */
  useBy: string | null
  autoList: boolean
  deletedAt: string | null
}

export interface DueInput {
  now: LocalNow
  household: NotifyHousehold
  items: NotifyItem[]
  /** Month budget use as a percent of the cap (spent plus committed); null when no cap. */
  budgetPct: number | null
  /** Over-budget amount in cents when the cap is passed, else 0. */
  overByCents: number
  /** Newest observed_on in the price book, or null when it is empty. */
  newestPriceOn: string | null
  /** Dedupe keys already recorded for this household (sent, queued or skipped). */
  sentKeys: Iterable<string>
}

export interface DueNotification {
  type: NotificationType
  /** Every key is recorded; the first is the row's main key. */
  keys: string[]
  title: string
  body: string
  /** In-app path the tap opens. */
  url: string
  audience: Audience
}

export const LOW_OUT_TIME = '17:00'
export const MORNING_TIME = '08:00'
export const DEFAULT_SHOP_TIME = '09:00'
/** Monday 09:00 carries the price-book reminder when no shop day is set. */
export const DEFAULT_STALE_DAY = 1
export const EXPIRING_DAYS = 2
export const STALE_PRICE_DAYS = 7
/** A time-of-day rule still fires this many minutes after its time, so a late hourly run catches up. */
export const CATCH_UP_MINUTES = 180
export const MAX_NAMES = 3

/* ---------------------------------------------------------------- time helpers ---------------------------------- */

export function minutesOf(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** True between quietFrom and quietTo, wrapping past midnight (22:00 to 07:00). Equal or missing bounds mean no quiet hours. */
export function inQuietHours(now: Pick<LocalNow, 'hour' | 'minute'>, quietFrom: string | null, quietTo: string | null): boolean {
  if (!quietFrom || !quietTo) return false
  const from = minutesOf(quietFrom)
  const to = minutesOf(quietTo)
  if (from === null || to === null || from === to) return false
  const t = now.hour * 60 + now.minute
  return from < to ? t >= from && t < to : t >= from || t < to
}

/** True from the target time until CATCH_UP_MINUTES after it. */
export function inWindow(now: Pick<LocalNow, 'hour' | 'minute'>, target: string, catchUp = CATCH_UP_MINUTES): boolean {
  const at = minutesOf(target)
  if (at === null) return false
  const t = now.hour * 60 + now.minute
  return t >= at && t < at + catchUp
}

export function daysBetweenKeys(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const ms = Date.UTC(by ?? 0, (bm ?? 1) - 1, bd ?? 1) - Date.UTC(ay ?? 0, (am ?? 1) - 1, ad ?? 1)
  return Math.round(ms / 86_400_000)
}

/* ---------------------------------------------------------------- text helpers ---------------------------------- */

export function listNames(names: string[], max = MAX_NAMES): string {
  const shown = names.slice(0, max)
  const rest = names.length - shown.length
  if (shown.length === 0) return ''
  if (rest > 0) return `${shown.join(', ')} and ${rest} more`
  if (shown.length === 1) return shown[0] ?? ''
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export function formatDollars(cents: number): string {
  const whole = Math.round(Math.abs(cents)) / 100
  return `$${whole.toFixed(whole % 1 === 0 ? 0 : 2)}`
}

/* ---------------------------------------------------------------- the rules ------------------------------------- */

/** Every notification due at `now`, minus anything already recorded. Empty inside quiet hours. */
export function dueNotifications(input: DueInput): DueNotification[] {
  const { now, household } = input
  if (inQuietHours(now, household.quietFrom, household.quietTo)) return []
  const sent = new Set(input.sentKeys)
  const live = input.items.filter((i) => !i.deletedAt)
  const out: DueNotification[] = []
  const fresh = (n: DueNotification | null) => {
    if (!n) return
    const keys = n.keys.filter((k) => !sent.has(k))
    if (keys.length === 0) return
    out.push({ ...n, keys })
  }

  fresh(lowOutDaily(now, live))
  fresh(expiringSoon(now, live))
  fresh(expired(now, live, sent))
  fresh(weeklyShop(now, household))
  fresh(priceBookStale(now, household, input.newestPriceOn))
  fresh(budgetCrossing(now, household, input.budgetPct, input.overByCents))
  return out
}

function lowOutDaily(now: LocalNow, items: NotifyItem[]): DueNotification | null {
  if (!inWindow(now, LOW_OUT_TIME)) return null
  const hit = items.filter((i) => i.status !== 'ok')
  if (hit.length === 0) return null
  const outs = hit.filter((i) => i.status === 'out')
  const lows = hit.filter((i) => i.status === 'low')
  const parts: string[] = []
  if (outs.length) parts.push(`Out: ${listNames(outs.map((i) => i.name))}`)
  if (lows.length) parts.push(`Low: ${listNames(lows.map((i) => i.name))}`)
  return {
    type: 'low_out_daily',
    keys: [`low_out_daily:${now.date}`],
    title: `${plural(hit.length, 'item')} ${hit.length === 1 ? 'is' : 'are'} low or out`,
    body: `${parts.join('. ')}. Tap to see the list.`,
    url: '/shop',
    audience: 'editors',
  }
}

function expiringSoon(now: LocalNow, items: NotifyItem[]): DueNotification | null {
  if (!inWindow(now, MORNING_TIME)) return null
  const soon = items.filter((i) => {
    if (!i.useBy) return false
    const d = daysBetweenKeys(now.date, i.useBy)
    return d >= 0 && d <= EXPIRING_DAYS
  })
  if (soon.length === 0) return null
  return {
    type: 'expiring_2_days',
    keys: [`expiring_2_days:${now.date}`],
    title: `${plural(soon.length, 'item')} to use in the next ${EXPIRING_DAYS} days`,
    body: `${listNames(soon.map((i) => i.name))}. Tap for ideas that use ${soon.length === 1 ? 'it' : 'them'} up.`,
    url: '/cook?mode=use_it_up',
    audience: 'editors',
  }
}

/** Once per item: the key carries the item and its date, so a new use-by date on the same item reports again. */
function expired(now: LocalNow, items: NotifyItem[], sent: Set<string>): DueNotification | null {
  if (!inWindow(now, MORNING_TIME)) return null
  const gone = items.filter((i) => i.useBy && daysBetweenKeys(now.date, i.useBy) < 0 && !sent.has(`expired:${i.id}:${i.useBy}`))
  if (gone.length === 0) return null
  return {
    type: 'expired',
    keys: gone.map((i) => `expired:${i.id}:${i.useBy}`),
    title: `${plural(gone.length, 'item')} past ${gone.length === 1 ? 'its' : 'their'} date`,
    body: `${listNames(gone.map((i) => i.name))}. Compost ${gone.length === 1 ? 'it' : 'them'} and mark ${gone.length === 1 ? 'it' : 'them'} Out.`,
    url: '/pantry?filter=expired',
    audience: 'owner',
  }
}

function shopTime(household: NotifyHousehold): { day: number; time: string } | null {
  if (household.weeklyShopDay === null || household.weeklyShopDay === undefined) return null
  if (household.weeklyShopDay < 0 || household.weeklyShopDay > 6) return null
  const time = household.weeklyShopTime && minutesOf(household.weeklyShopTime) !== null ? household.weeklyShopTime : DEFAULT_SHOP_TIME
  return { day: household.weeklyShopDay, time }
}

function weeklyShop(now: LocalNow, household: NotifyHousehold): DueNotification | null {
  const at = shopTime(household)
  if (!at || now.weekday !== at.day || !inWindow(now, at.time)) return null
  return {
    type: 'weekly_shop',
    keys: [`weekly_shop:${now.date}`],
    title: 'Shop day',
    body: 'Your list is ready to check and send.',
    url: '/shop',
    audience: 'editors',
  }
}

/** Weekly, with the shop reminder (or Monday 09:00 when no shop day is set), only when the newest price is 7+ days old. */
function priceBookStale(now: LocalNow, household: NotifyHousehold, newestPriceOn: string | null): DueNotification | null {
  if (!newestPriceOn) return null
  const at = shopTime(household) ?? { day: DEFAULT_STALE_DAY, time: DEFAULT_SHOP_TIME }
  if (now.weekday !== at.day || !inWindow(now, at.time)) return null
  const age = daysBetweenKeys(newestPriceOn, now.date)
  if (age < STALE_PRICE_DAYS) return null
  return {
    type: 'price_book_stale',
    keys: [`price_book_stale:${now.date}`],
    title: 'Prices are getting old',
    body: `The newest price is ${plural(age, 'day')} old. Snap a receipt or run a price check to freshen them.`,
    url: '/shop/prices',
    audience: 'owner',
  }
}

/** Once per month per line: the 80% line (or the household's own warn percent) and the 100% line. */
function budgetCrossing(now: LocalNow, household: NotifyHousehold, pct: number | null, overByCents: number): DueNotification | null {
  if (pct === null || !Number.isFinite(pct)) return null
  const month = now.date.slice(0, 7)
  if (pct >= 100) {
    return {
      type: 'budget_100',
      keys: [`budget_100:${month}`, `budget_80:${month}`],
      title: 'Budget used up for the month',
      body: overByCents > 0 ? `Over by ${formatDollars(overByCents)}. Nothing is blocked; this is just so you know.` : 'Right at the line. Nothing is blocked; this is just so you know.',
      url: '/shop/budget',
      audience: 'owner',
    }
  }
  const warn = household.budgetWarnPct ?? 80
  if (pct >= warn) {
    return {
      type: 'budget_80',
      keys: [`budget_80:${month}`],
      title: `${Math.round(pct)}% of the month's budget used`,
      body: 'Tap to see what is left and what is still on order.',
      url: '/shop/budget',
      audience: 'owner',
    }
  }
  return null
}

/** Members a notification reaches, by role. Agents never get a phone buzz; viewers only hear about sent lists. */
export function audienceRoles(audience: Audience): ReadonlyArray<'owner' | 'editor' | 'viewer'> {
  switch (audience) {
    case 'owner':
      return ['owner']
    case 'editors':
      return ['owner', 'editor']
    case 'all_but_sender':
      return ['owner', 'editor', 'viewer']
  }
}
