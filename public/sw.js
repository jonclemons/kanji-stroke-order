const CACHE_PREFIX = "kanji-app";
const APP_VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_NAME = `${CACHE_PREFIX}-${APP_VERSION}`;
const CORE_ASSETS = [
  "/",
  "/manifest.json",
  "/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const staleKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME);

    await Promise.all(staleKeys.map((k) => caches.delete(k)));
    await self.clients.claim();

    if (staleKeys.length > 0) {
      const clients = await self.clients.matchAll({ type: "window" });
      await Promise.all(clients.map((client) => client.navigate(client.url)));
    }
  })());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  if (url.origin !== self.location.origin || e.request.method !== "GET") {
    return;
  }

  // Mirrored kanji data is versioned and cached in IndexedDB by the app itself.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/data/")) {
    return;
  }

  if (e.request.mode === "navigate") {
    e.respondWith(networkFirst(e.request));
  }
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const fallback = await caches.match("/");
      if (fallback) return fallback;
    }
    throw error;
  }
}
