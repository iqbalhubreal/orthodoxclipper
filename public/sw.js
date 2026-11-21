/* Service worker for the Clip Maker PWA.
   - Pages, /js/* and /css/*: network first (so a new deploy never mixes old and new files), cached copy when offline.
   - Other own static files (icons, vendor/ffmpeg wrappers): stale-while-revalidate.
   - The ~31 MB ffmpeg core and mediabunny from the CDN: cached after the first download, so later cutting works offline.
   - Never touches /api/*, /__native_clip__/*, .zip downloads, non-GET requests, or anything else cross-origin (YouTube, etc). */
const VERSION = "clipper-v1.15.0";
const SHELL = `${VERSION}-shell`;
const CORE = "clipper-ffmpeg-core-0.12.6"; // not tied to the app version: the engine rarely changes
const PRECACHE = [
  "/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png",
  "/css/styles.css", "/css/editor.css", "/css/history.css",
  ...["config", "notes", "ui", "steps", "zip", "ai", "engine", "results", "cutting", "upload", "stage", "vertical", "presets", "editor", "veditor", "theme", "pwa", "app", "history"].map(n => `/js/${n}.js`)
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

const isCore = url => /^(cdn\.jsdelivr\.net|unpkg\.com)$/.test(url.hostname) && (url.pathname.includes("/@ffmpeg/core@0.12.6/") || url.pathname.includes("/mediabunny@1"));

self.addEventListener("fetch", event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== "GET" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/__native_clip__/") || url.pathname.endsWith(".zip")) return;
  if (isCore(url)) {
    event.respondWith(caches.open(CORE).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) c.put(req, res.clone());
      return res;
    }))));
    return;
  }
  if (url.origin !== location.origin) return;
  const fresh = req.mode === "navigate" || url.pathname.endsWith(".js") || url.pathname.endsWith(".css");
  event.respondWith(fresh ? networkFirst(req) : staleWhileRevalidate(req));
});

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req)) || (req.mode === "navigate" ? cache.match("/") : Response.error());
  }
}
async function staleWhileRevalidate(req) {
  const cache = await caches.open(SHELL), hit = await cache.match(req);
  const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}
