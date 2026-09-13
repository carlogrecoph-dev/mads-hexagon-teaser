/* M.A.D.S. Hexagon — offline shell */
const CACHE = "mads-hexagon-v1";
const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/models/female.vrm",
  "/brand/mads-logo.jpg",
  "/brand/mads-logo.svg",
  "/brand/hoodie-logo.jpg",
  "/brand/studio-floor.jpg",
  "/brand/studio-wall.jpg",
  "/brand/studio-steel.jpg",
  "/textures/fleece.jpg",
  "/textures/hoodie.jpg",
  "/textures/head.jpg",
  "/textures/floor.jpg",
  "/textures/wall.jpg",
  "/samples/portrait-gaze.jpg",
  "/samples/color-field.jpg",
  "/samples/night-harbor.jpg",
  "/samples/still-life.jpg",
];

function bypass(url) {
  if (url.pathname.startsWith("/@") || url.pathname.startsWith("/src/")) return true;
  if (url.pathname.includes("node_modules") || url.pathname.includes("@vite")) return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (url.searchParams.has("t")) return true;
  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.allSettled(PRECACHE.map((u) => cache.add(u)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const hit = await cache.match(request);
    if (hit) return hit;
    if (request.mode === "navigate") {
      const home = await cache.match("/");
      if (home) return home;
    }
    throw new Error("offline");
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const fresh = await fetch(request);
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (bypass(url)) return;
  if (url.origin !== self.location.origin) {
    if (url.hostname.includes("fonts.g") || url.hostname.includes("gstatic")) {
      event.respondWith(cacheFirst(req));
    }
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }
  event.respondWith(cacheFirst(req));
});
