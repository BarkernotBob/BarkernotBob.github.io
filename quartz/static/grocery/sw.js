/* Grocery Tracker service worker (PRD S2 / §11.2).
   Offline is READ-ONLY: this SW precaches the app shell (HTML + icons + manifest)
   so the app launches without a network; the data itself comes from the app's
   IndexedDB snapshot (data layer v2, S1). It deliberately does NOT touch
   api.github.com — those requests pass straight through, and when offline the app
   falls back to its IDB snapshot on its own. */
const VERSION = 'gt-shell-v5'
const SHELL = [
  'index.html',
  'manifest.webmanifest',
  'tokens.css',
  'app.css',
  // JS is ES modules now (§11.1 split) — precache the whole graph so the app
  // launches offline even if the network drops mid-first-load.
  'app.js',
  'core/domain.js',
  'ui/components.js',
  'views/today.js',
  'views/pantry.js',
  'views/capture.js',
  'views/trips.js',
  'views/reports.js',
  'views/review.js',
  'views/table.js',
  'views/settings.js',
  // The shared helper modules (GAP-W5). They live outside this SW's scope, at
  // /static/shared/, but scope only decides which PAGES this worker controls —
  // a controlled page's request for any same-origin URL still reaches the fetch
  // handler below, so precaching them here keeps the app launching offline.
  '../shared/dom.js',
  '../shared/text.js',
  '../shared/dates.js',
  '../shared/ids.js',
  '../shared/storage.js',
  '../shared/github.js',
  '../shared/ui.js',
  'fonts/archivo-400-700.woff2',
  'fonts/fraunces-600.woff2',
  'fonts/ibm-plex-mono-400.woff2',
  'fonts/ibm-plex-mono-500.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  )
})

// Delete only THIS app's own old caches. `caches` is origin-wide and all four
// apps share barkernotbob.github.io, so an unscoped `k !== VERSION` filter
// deletes the other three apps' shells every time this one activates — only the
// app you opened most recently would still launch offline. Reproduced before
// fixing: opening the apps in turn left exactly one cache each time.
const OWNED = (k) => k.startsWith('gt-')

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
  // Never intercept the GitHub API or any cross-origin request — data freshness
  // and auth must go to the network; offline is handled by the app's IDB cache.
  if (url.origin !== self.location.origin) return
  if (req.method !== 'GET') return
  // Stale-while-revalidate for the same-origin shell: serve cache immediately,
  // refresh in the background so the next launch has the latest. For a navigation
  // that misses cache (e.g. the bare /grocery/ URL), fall back to the cached
  // index.html so the app still launches offline.
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
