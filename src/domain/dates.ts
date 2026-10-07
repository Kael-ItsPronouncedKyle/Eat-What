/** Date helpers. All "date" strings are local calendar dates in YYYY-MM-DD; timestamps are ISO strings. */

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function today(now: Date = new Date()): string {
  return toDateKey(now)
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

export function addDays(key: string, days: number): string {
  const d = parseDateKey(key)
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

/** Whole days from a to b (b - a). Negative when b is before a. */
export function daysBetween(a: string, b: string): number {
  const ms = parseDateKey(b).getTime() - parseDateKey(a).getTime()
  return Math.round(ms / 86_400_000)
}

export function weekdayOf(key: string): number {
  return parseDateKey(key).getDay()
}

/** Monday to Sunday week containing `key` (startsOn 1) or Sunday to Saturday (startsOn 0). */
export function weekRange(key: string, startsOn: 0 | 1 = 1): { from: string; to: string } {
  const wd = weekdayOf(key)
  const back = (wd - startsOn + 7) % 7
  const from = addDays(key, -back)
  return { from, to: addDays(from, 6) }
}

export function monthKey(key: string): string {
  return key.slice(0, 7)
}

export function formatDate(key: string, style: 'short' | 'long' | 'weekday' = 'short'): string {
  const d = parseDateKey(key)
  if (style === 'weekday') return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  if (style === 'long') return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Plain-language relative day: Today, Tomorrow, Yesterday, else weekday + date. */
export function relativeDay(key: string, todayKey: string): string {
  const diff = daysBetween(todayKey, key)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return formatDate(key, 'weekday')
}
