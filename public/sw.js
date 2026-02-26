// ContentGenie Service Worker
// Bump CACHE_VERSION when changing caching strategies or precached resources.
// Old caches are automatically deleted on activation.
const CACHE_VERSION = "contentgenie-v2";

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

  if (isStaticAsset && request.method === "GET") {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches
                .open(CACHE_VERSION)
                .then((cache) => cache.put(request, clone))
                .catch((err) => console.error("SW cache.put failed:", err));
            }
            return response;
          })
      )
    );
    return;
  }

  // All other requests: pass through to network
});

// Validate notification URLs — same-origin only, reject dangerous schemes
function sanitizeNotificationUrl(rawUrl) {
  if (typeof rawUrl !== "string") return "/";
  try {
    const parsed = new URL(rawUrl, self.location.origin);
    if (parsed.origin !== self.location.origin) return "/";
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
  } catch {
    return "/";
  }
}

// Push notification handler
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }

  const options = {
    body: data.body || "",
    icon: "/icon-192x192.png",
    badge: "/icon-192x192.png",
    tag: data.tag || undefined,
    data: { url: sanitizeNotificationUrl(data.data?.url) },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "ContentGenie", options)
  );
});

// Notification click handler
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = sanitizeNotificationUrl(event.notification.data?.url);

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing window and navigate to the URL
        for (const client of clientList) {
          if ("focus" in client) {
            return client.focus().then((focused) => {
              if ("navigate" in focused) {
                return focused.navigate(url);
              }
            });
          }
        }
        // No existing window — open a new one
        return self.clients.openWindow(url);
      })
  );
});
