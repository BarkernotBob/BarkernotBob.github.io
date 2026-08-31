/* =========================================================================
   Pool Care — service worker (PWA offline app-shell).
   - Precaches the app shell so it opens offline / from the Home Screen.
   - Same-origin files: stale-while-revalidate (fast launch, updates in bg).
   - Google Fonts: cache-first (so the shell looks right offline).
   - Everything else (api.github.com, open-meteo): network only — pool DATA
     and writes must never be served stale from a cache.
   Bump CACHE on any shell change to force clients onto the new version.
   ========================================================================= */
const CACHE = 'poolcare-v2';
const FONTS = 'poolcare-fonts-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './favicon-32.png',
  // The shared escaper (GAP-W5). It lives outside this SW's scope, at
  // /static/shared/, but scope only decides which PAGES this worker controls —
  // a controlled page's request for it still reaches the fetch handler below,
  // so precaching it keeps the app launching offline now that index.html is a
  // module that imports it.
  '../shared/text.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return; // never touch POST/PUT (GitHub writes)
  const url = new URL(req.url);

  // Google Fonts — cache-first so the shell renders offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONTS).then(c =>
        c.match(req).then(hit => hit || fetch(req).then(res => { c.put(req, res.clone()); return res; }).catch(() => hit))
      )
    );
    return;
  }

  // Only manage our own origin's shell; let API/weather calls go straight to network.
  if (url.origin !== location.origin) return;

  // Navigations: serve cached shell when the network is unavailable.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html').then(r => r || caches.match('./'))));
    return;
  }

  // Same-origin assets: stale-while-revalidate.
  e.respondWith(
    caches.open(CACHE).then(c =>
      c.match(req).then(hit => {
        const net = fetch(req).then(res => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      })
    )
  );
});
