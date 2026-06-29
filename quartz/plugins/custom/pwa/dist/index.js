import { writeFile } from "fs/promises";
import { join } from "path";

var SW_CONTENT = `
const CACHE = "isaiah-barker-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(["/"]).then(() => self.skipWaiting()))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Cache-first for static assets (content-hashed JS/CSS/fonts/images)
  if (/\\.(js|css|woff2?|png|jpg|jpeg|gif|svg|ico|webp)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((resp) => {
            if (resp.ok) caches.open(CACHE).then((c) => c.put(req, resp.clone()));
            return resp;
          })
      )
    );
    return;
  }

  // Network-first for HTML / navigation — always try fresh, fall back to cache offline
  e.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp.ok) caches.open(CACHE).then((c) => c.put(req, resp.clone()));
        return resp;
      })
      .catch(() => caches.match(req))
  );
});
`.trim();

var MANIFEST_CONTENT = JSON.stringify(
  {
    name: "Isaiah Barker",
    short_name: "Isaiah",
    description: "Notes, curated YouTube, tools, and games",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    theme_color: "#e8443a",
    background_color: "#fff6ea",
    icons: [
      {
        src: "/static/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/static/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
    categories: ["education", "productivity"],
  },
  null,
  2
);

var PWA = function (_opts) {
  return {
    name: "PWA",
    async *emit(ctx) {
      const out = ctx.argv.output;
      await writeFile(join(out, "sw.js"), SW_CONTENT, "utf-8");
      yield join(out, "sw.js");
      await writeFile(join(out, "manifest.webmanifest"), MANIFEST_CONTENT, "utf-8");
      yield join(out, "manifest.webmanifest");
    },
  };
};

export default PWA;
