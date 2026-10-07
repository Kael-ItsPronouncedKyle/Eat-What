/* The app's service worker (vite-plugin-pwa injectManifest builds this to dist/sw.js).
   Precaches the build, serves the app shell for navigations, and shows Web Push notifications that deep-link to the
   screen that resolves them (spec: Notifications). Payloads come from supabase/functions/notify as { title, body, url }. */
/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope

interface PushPayload {
  title?: string
  body?: string
  url?: string
  tag?: string
}

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL(`${import.meta.env.BASE_URL}index.html`)))

// registerType 'autoUpdate': take over as soon as a new build is installed.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') void self.skipWaiting()
})
void self.skipWaiting()
clientsClaim()

self.addEventListener('push', (event) => {
  const payload = readPayload(event.data)
  const title = payload.title ?? 'Quartermaster'
  const url = payload.url ?? '/'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body ?? '',
      tag: payload.tag ?? url,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/'
  // Deep links from the server are app paths ('/shop/ordered'); prefix the base when the app lives under a sub-path.
  const base = import.meta.env.BASE_URL
  const path = url.startsWith('/') && base !== '/' && !url.startsWith(base) ? base.replace(/\/$/, '') + url : url
  const target = new URL(path, self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          const focused = await client.focus()
          if ('navigate' in focused && typeof focused.navigate === 'function') await focused.navigate(target)
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})

function readPayload(data: PushMessageData | null): PushPayload {
  if (!data) return {}
  try {
    const parsed = data.json() as unknown
    return parsed && typeof parsed === 'object' ? (parsed as PushPayload) : { body: data.text() }
  } catch {
    return { body: data.text() }
  }
}
