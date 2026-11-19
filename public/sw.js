/* Service worker for the Clip Maker PWA.
   - Pages, /js/* and /css/*: network first (so a new deploy never mixes old and new files), cached copy when offline.
   - Other own static files (icons, vendor/ffmpeg wrappers): stale-while-revalidate.
   - The ~31 MB ffmpeg core from the CDN: cached after the first download, so later cutting works offline.
   - Never touches /api/*, non-GET requests, or anything else cross-origin (YouTube, etc). */
const VERSION = "clipper-v1.11.0";
const SHELL = `${VERSION}-shell`;
const CORE = "clipper-ffmpeg-core-0.12.6"; // not tied to the app version: the engine rarely changes
const PRECACHE = [
  "/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png",
  "/css/styles.css", "/css/editor.css", "/css/history.css",
  ...["config", "notes", "ui", "steps", "zip", "ai", "engine", "results", "cutting", "upload", "vertical", "editor", "theme", "pwa", "app", "history"].map(n => `/js/${n}.js`)
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== SHELL && key !== CORE) await caches.delete(key);
    await self.clients.claim();
  })());
});

const isCore = url => /^(cdn\.jsdelivr\.net|unpkg\.com)$/.test(url.hostname) && url.pathname.includes("/@ffmpeg/core@0.12.6/");

self.addEventListener("fetch", event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== "GET" || req.headers.has("range")) return;

  if (isCore(url)) { event.respondWith(coreFirst(req)); return; }
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") { event.respondWith(networkFirst(req, "/")); return; }
  if (url.pathname === "/sw.js") return;
  if (url.pathname.startsWith("/js/") || url.pathname.startsWith("/css/")) { event.respondWith(networkFirst(req, req)); return; }
  event.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req, key) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch {
    return (await cache.match(key)) || new Response("You are offline and this file was not saved yet.", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}
async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL), hit = await cache.match(req);
  const fresh = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await fresh) || new Response("", { status: 504 });
}
async function coreFirst(req) {
  const cache = await caches.open(CORE), hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.status === 200) cache.put(req, res.clone());
  return res;
}
