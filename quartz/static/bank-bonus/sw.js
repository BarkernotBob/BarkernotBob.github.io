/* Bank Bonus Tracker — Service Worker
   Caches the app shell for instant offline load. GitHub API calls always go
   to the network; only the app HTML is served from cache when offline. */

const CACHE = 'bb-v1';
const SHELL = [
  '/static/bank-bonus/',
  '/static/bank-bonus/index.html',
  '/static/bank-bonus/manifest.json',
  '/static/bank-bonus/icon-192.png',
  '/static/bank-bonus/icon-512.png',
  '/static/bank-bonus/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always fetch GitHub API calls from the network — data must be live.
  if (url.hostname === 'api.github.com' || url.hostname.endsWith('.workers.dev')) {
    return;
  }

  // Cache-first for the app shell; network-first with cache fallback for everything else.
  if (SHELL.some(s => url.pathname === s || url.pathname === s.replace(/\/$/, '/index.html'))) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }))
    );
  }
});
