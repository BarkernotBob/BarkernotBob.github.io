/* Bank Bonus Tracker — Service Worker
   Stale-while-revalidate for the app shell: serve cache instantly, fetch
   fresh in the background so the next open always has the latest version.
   GitHub API calls always go to the network. */

const CACHE = 'bb-v6';
const SHELL = [
  '/static/bank-bonus/',
  '/static/bank-bonus/index.html',
  '/static/bank-bonus/starter-offers.js',
  '/static/bank-bonus/manifest.webmanifest',
  '/static/bank-bonus/icon-192.png',
  '/static/bank-bonus/icon-512.png',
  '/static/bank-bonus/apple-touch-icon.png',
  // The shared escaper (GAP-W5). Outside this SW's scope, but scope only
  // decides which PAGES it controls — a controlled page's request for it still
  // reaches the fetch handler below. index.html is a module that imports it,
  // so without this entry the app would not launch offline.
  '/static/shared/text.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// Delete only THIS app's own old caches. `caches` is origin-wide and all four
// apps share barkernotbob.github.io, so an unscoped `k !== CACHE` filter
// deletes the other three apps' shells every time this one activates — only the
// app you opened most recently would still launch offline. Reproduced before
// fixing: opening the apps in turn left exactly one cache each time.
const OWNED = (k) => k.startsWith('bb-')

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => OWNED(k) && k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always fetch GitHub API calls from the network.
  if (url.hostname === 'api.github.com') {
    return;
  }

  // Stale-while-revalidate for the app shell: return cached version
  // immediately (fast), but always fetch fresh and update the cache in the
  // background so the *next* open gets the latest code.
  if (SHELL.some(s => url.pathname === s || url.pathname === s.replace(/\/$/, '/index.html'))) {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          const fresh = fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          }).catch(() => cached);
          return cached || fresh;
        })
      )
    );
  }
});
