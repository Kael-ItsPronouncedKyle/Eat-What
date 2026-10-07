/* Web Push on this phone (spec: Notifications). The browser's PushManager hands us an endpoint plus two keys; we keep
   them in push_subscriptions through the Repository so the notify edge function can send to this phone. In local mode
   the row is saved on the device only: delivery needs the Supabase backend and the notify function. */

import type { PushSubscription as PushRow } from '@/domain/types'
import { newId } from '@/domain/ids'
import { nowIso, type Repository } from '@/data/repository'

export type PushStatus =
  /** The browser has no PushManager or no service worker (plain Safari tab on iOS, old browsers). */
  | 'unsupported'
  /** VITE_VAPID_PUBLIC_KEY is not set, so the server cannot sign pushes. */
  | 'no_key'
  /** The person blocked notifications for this site. */
  | 'denied'
  /** Subscribed on this phone and the row is stored. */
  | 'on'
  /** Supported and allowed (or not asked yet), but not subscribed here. */
  | 'off'

export function isPushSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function vapidPublicKey(): string | null {
  const key = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim()
  return key ? key : null
}

/** Browser-side status for the toggle; cheap and never prompts. */
export async function pushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported'
  if (!vapidPublicKey()) return 'no_key'
  if (Notification.permission === 'denied') return 'denied'
  const current = await currentSubscription()
  return current ? 'on' : 'off'
}

/** How long subscribe() waits for the service worker to finish installing. `serviceWorker.ready` never settles when no
    worker is registered (dev mode, or a failed registration), so the wait is capped. */
export const READY_TIMEOUT_MS = 5000

/** The active registration, or null. With `wait` it also gives a worker that is still installing a few seconds. */
async function registration(wait = false): Promise<ServiceWorkerRegistration | null> {
  try {
    const current = await navigator.serviceWorker.getRegistration()
    if (current || !wait) return current ?? null
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), READY_TIMEOUT_MS)),
    ])
  } catch {
    return null
  }
}

async function currentSubscription(): Promise<globalThis.PushSubscription | null> {
  const reg = await registration()
  if (!reg) return null
  try {
    return await reg.pushManager.getSubscription()
  } catch {
    return null
  }
}

/** Ask for permission, subscribe with the PushManager and store the row. Throws a plain-language Error when it cannot. */
export async function subscribe(repo: Repository, userId: string, publicKey: string | null = vapidPublicKey()): Promise<PushRow> {
  if (!isPushSupported()) throw new Error('This browser cannot receive push notifications.')
  if (!publicKey) throw new Error('Push is not set up on this server yet.')
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications are blocked for this site. Allow them in your browser settings, then try again.')
  const reg = await registration(true)
  if (!reg) throw new Error('The app is not installed as a service worker yet. Reload once and try again.')
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }))
  const row = toRow(sub, userId)
  if (!row) throw new Error('The browser did not hand back push keys. Try again.')
  const col = repo.table('push_subscriptions')
  const existing = (await col.list('')).find((r) => r.endpoint === row.endpoint)
  if (existing) {
    const next = { ...existing, p256dh: row.p256dh, auth: row.auth, userAgent: row.userAgent, lastSeenAt: row.lastSeenAt }
    await col.put(next)
    return next
  }
  await col.put(row)
  return row
}

/** Drop this phone's subscription both in the browser and in the table. Safe to call when there is none. */
export async function unsubscribe(repo: Repository): Promise<void> {
  const sub = await currentSubscription()
  const endpoint = sub?.endpoint ?? null
  if (sub) {
    try {
      await sub.unsubscribe()
    } catch {
      /* the row still goes; the push service will answer 410 next time */
    }
  }
  if (!endpoint) return
  const col = repo.table('push_subscriptions')
  for (const r of await col.list('')) if (r.endpoint === endpoint) await col.remove(r.id)
}

/** The stored shape: endpoint, keys and the browser name, so the owner can tell phones apart later. */
export function toRow(sub: Pick<globalThis.PushSubscription, 'endpoint' | 'toJSON'>, userId: string, userAgent: string | null = typeof navigator === 'undefined' ? null : navigator.userAgent): PushRow | null {
  const json = sub.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!sub.endpoint || !p256dh || !auth) return null
  const now = nowIso()
  return { id: newId(), userId, endpoint: sub.endpoint, p256dh, auth, userAgent, createdAt: now, lastSeenAt: now }
}

/** The VAPID public key arrives URL-safe base64; PushManager wants raw bytes. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
