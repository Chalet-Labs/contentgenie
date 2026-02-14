// ContentGenie Service Worker
// Bump CACHE_VERSION when changing caching strategies or precached resources.
// Old caches are automatically deleted on activation.
const CACHE_VERSION = "contentgenie-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.add("/offline"))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Navigation requests: network-first with offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline"))
    );
    return;
  }

  // Static assets: cache-first
  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    /\.(js|css|woff2|woff|ttf|png|jpg|jpeg|svg|ico)$/.test(url.pathname);

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
            return response;
          })
      )
    );
    return;
  }

  // All other requests: pass through to network
});
