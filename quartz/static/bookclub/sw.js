/* Book club — service worker. Makes the page installable and lets it open
   from the Home Screen with a flaky connection.
   - Page files: network-first, cache fallback (always fresh when online).
   - Google Fonts: cache-first.
   - The API (workers.dev) and anything non-GET: never touched, so availability
     is never shown stale from a cache.
   Bump CACHE when the shell list changes. */
const CACHE = 'bc-v1'
const FONTS = 'bc-fonts-v1'
const SHELL = ['./', './index.html', './app.css', './app.js', './logic.js', './manifest.webmanifest', './icons/icon-192.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

// All the site's apps share one origin and one CacheStorage: only ever delete
// this app's own old caches.
const OWNED = (k) => k.startsWith('bc-')
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => OWNED(k) && k !== CACHE && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONTS).then((c) =>
        c.match(req).then((hit) => hit || fetch(req).then((res) => (c.put(req, res.clone()), res)).catch(() => hit)),
      ),
    )
    return
  }
  if (url.origin !== location.origin) return // the API: network only

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(() => caches.match(req, { ignoreSearch: true })),
  )
})
