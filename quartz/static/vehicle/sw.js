/* Driveline service worker — cloned from the grocery app's (GAP-W6).

   Offline is READ-ONLY: this SW precaches the app shell (the single-file HTML +
   manifest + icons) so the app launches without a network; the data itself lives
   in localStorage, which needs no network at all. It deliberately does NOT touch
   api.github.com or any other origin — those requests pass straight through, so
   auth and data freshness can never be served from a stale cache. */
const VERSION = 'dl-shell-v2'
const SHELL = [
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  // The shared escaper (GAP-W5). It sits outside this SW's scope, at
  // /static/shared/, but scope only decides which PAGES this worker controls —
  // a controlled page's request for it still reaches the fetch handler below.
  // index.html is a module that imports it, so without this entry the app
  // would not launch offline.
  '../shared/text.js',
]

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

// Delete only THIS app's own old caches. `caches` is origin-wide and all four
// apps share barkernotbob.github.io, so an unscoped `k !== VERSION` filter
// deletes the other three apps' shells every time this one activates — only the
// app you opened most recently would still launch offline. Reproduced before
// fixing: opening the apps in turn left exactly one cache each time.
const OWNED = (k) => k.startsWith('dl-')

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => OWNED(k) && k !== VERSION).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  // Never intercept a cross-origin request — the GitHub API, the Google Fonts
  // CDN and anything else must go to the network on their own terms.
  if (url.origin !== self.location.origin) return
  if (req.method !== 'GET') return
  // Stale-while-revalidate for the same-origin shell: serve cache immediately,
  // refresh in the background so the next launch has the latest. A navigation
  // that misses cache falls back to the cached index.html so the app still
  // launches offline.
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone()
            caches.open(VERSION).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => cached || (req.mode === 'navigate' ? caches.match('index.html') : undefined))
      return cached || network
    })
  )
})
