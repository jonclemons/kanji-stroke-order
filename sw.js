const CACHE_PREFIX = "kanji-app";
const APP_VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_NAME = `${CACHE_PREFIX}-${APP_VERSION}`;
const APP_SHELL = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/src/main.js",
  "/src/app-shell.js",
  "/src/version.js",
  "/manifest.json",
  "/icon.svg",
];
const APP_SHELL_PATHS = new Set(APP_SHELL);

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
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
  if (url.pathname.startsWith("/data/")) {
    return;
  }

  if (e.request.mode === "navigate" || APP_SHELL_PATHS.has(url.pathname)) {
    e.respondWith(networkFirst(e.request, e.request.mode === "navigate" ? "/index.html" : null));
  }
});

async function networkFirst(request, fallbackUrl) {
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
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw error;
  }
}
