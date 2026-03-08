// ContentGenie Service Worker (Module)
// Bump CACHE_VERSION when changing caching strategies or precached resources.
// Old caches are automatically deleted on activation.
const CACHE_VERSION = "contentgenie-v2";

// ─── Sync queue constants ────────────────────────────────────────────────────
const SYNC_DB_NAME = "contentgenie-offline-queue";
const SYNC_STORE_NAME = "actions";
const SYNC_TAG = "sync-offline-actions";
const MAX_RETRY_ATTEMPTS = 3;
const SYNC_REPLAY_LOCK = "contentgenie-sync-replay";

const ACTION_ROUTES = new Map([
  ["save-episode", "/api/library/save"],
  ["unsave-episode", "/api/library/unsave"],
  ["subscribe", "/api/subscriptions/subscribe"],
  ["unsubscribe", "/api/subscriptions/unsubscribe"],
]);

// ─── Raw IndexedDB helpers ───────────────────────────────────────────────────

function openSyncDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SYNC_DB_NAME);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    // If the DB doesn't exist yet, idb-keyval creates it from the client.
    // The SW only reads/writes to an existing DB. If this fires, create the store.
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(SYNC_STORE_NAME)) {
        db.createObjectStore(SYNC_STORE_NAME);
      }
    };
  });
}

function idbGetAll(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_STORE_NAME, "readonly");
    const store = tx.objectStore(SYNC_STORE_NAME);
    const items = [];

    const request = store.openCursor();
    request.onerror = () => reject(request.error);
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        items.push({ key: cursor.key, value: cursor.value });
        cursor.continue();
      } else {
        resolve(items);
      }
    };
  });
}

function idbPut(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_STORE_NAME, "readwrite");
    const store = tx.objectStore(SYNC_STORE_NAME);
    const request = store.put(value, key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

function idbDelete(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_STORE_NAME, "readwrite");
    const store = tx.objectStore(SYNC_STORE_NAME);
    const request = store.delete(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// ─── Install / Activate / Fetch ──────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.add("/offline"))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      // Clean old caches
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
        )
      ),
      // Reset stale in-flight items to pending (SW restart recovery)
      resetStaleInFlightItems(),
    ])
  );
  self.clients.claim();
});

async function resetStaleInFlightItems() {
  let db;
  try {
    db = await openSyncDB();
  } catch {
    return;
  }
  try {
    const allEntries = await idbGetAll(db);
    for (const entry of allEntries) {
      if (entry.value && entry.value.status === "in-flight") {
        entry.value.status = "pending";
        await idbPut(db, entry.key, entry.value);
      }
    }
  } finally {
    db.close();
  }
}

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

// ─── Push / Notification handlers ────────────────────────────────────────────

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

// ─── Sync helpers ────────────────────────────────────────────────────────────

async function handleFailedAttempt(db, item, key, lastChance, reason) {
  item.attempts = (item.attempts || 0) + 1;
  if (item.attempts >= MAX_RETRY_ATTEMPTS || lastChance) {
    item.status = "failed";
    await idbPut(db, key, item);
    return { id: item.id, status: "failed", reason };
  } else {
    item.status = "pending";
    await idbPut(db, key, item);
    return { id: item.id, status: "retry", attempts: item.attempts };
  }
}

// ─── Background Sync handler ─────────────────────────────────────────────────

self.addEventListener("sync", (event) => {
  if (event.tag !== SYNC_TAG) return;

  event.waitUntil(handleSync(event.lastChance));
});

async function handleSync(lastChance = false) {
  // Use navigator.locks to prevent concurrent replay from SW and client
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(
      SYNC_REPLAY_LOCK,
      { ifAvailable: true },
      async (lock) => {
        if (!lock) return; // Another replay is in progress
        return handleSyncInner(lastChance);
      }
    );
  }
  // Fallback: proceed without lock (older browsers)
  return handleSyncInner(lastChance);
}

async function handleSyncInner(lastChance = false) {
  const results = [];

  let db;
  try {
    db = await openSyncDB();
  } catch {
    // IDB not available — nothing to sync
    return;
  }

  try {
    const allEntries = await idbGetAll(db);
    const pendingItems = allEntries.filter(
      (entry) => entry.value && entry.value.status === "pending"
    );

    for (const entry of pendingItems) {
      const item = entry.value;
      const key = entry.key;
      const route = ACTION_ROUTES.get(item.action);

      if (!route) {
        // Unknown action — remove from queue
        await idbDelete(db, key);
        results.push({ id: item.id, status: "removed", reason: "unknown-action" });
        continue;
      }

      // Mark in-flight
      item.status = "in-flight";
      await idbPut(db, key, item);

      try {
        const response = await fetch(route, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(item.payload),
        });

        if (response.ok) {
          await idbDelete(db, key);
          results.push({ id: item.id, status: "success" });
        } else if (response.status === 401) {
          // Session expired — drain immediately, don't retry
          await idbDelete(db, key);
          results.push({ id: item.id, status: "drained", reason: "unauthorized" });
        } else {
          // Server error — increment attempts
          results.push(await handleFailedAttempt(db, item, key, lastChance, "max-retries"));
        }
      } catch {
        // Network error during fetch
        results.push(await handleFailedAttempt(db, item, key, lastChance, "network-error"));
      }
    }
  } finally {
    db.close();
  }

  // Notify all client windows
  const clients = await self.clients.matchAll({ type: "window" });
  for (const client of clients) {
    client.postMessage({ type: "sync-complete", results });
  }
}
