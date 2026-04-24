# ADR-012: Background Sync for Offline Save and Subscribe Actions

**Status:** Proposed
**Date:** 2026-03-01
**Issue:** [#91](https://github.com/Chalet-Labs/contentgenie/issues/91)

## Context

When ContentGenie is installed as a PWA and the user loses connectivity, "Save" and "Subscribe" toggle actions fail silently because they invoke server actions that require a network connection. Users expect instant feedback and eventual consistency: the UI should respond immediately and the mutation should replay automatically when connectivity returns.

The codebase already has:

- `idb-keyval` for IndexedDB access (ADR-011, `src/lib/offline-cache.ts`)
- `useOnlineStatus` hook for connectivity detection (`src/hooks/use-online-status.ts`)
- A service worker (`public/sw.js`) handling push notifications and static asset caching (ADR-009)

The Background Sync API (`SyncManager.register()`) is supported in Chromium browsers but not in Safari or Firefox. A fallback using the `online` event is necessary for full coverage.

### Critical constraints discovered during research

1. **`idb-keyval` cannot share a database name across two `createStore` calls.** The existing `offline-cache.ts` uses `createStore("contentgenie-offline", "episode-cache")`. A second `createStore` with the same DB name silently fails. The sync queue must use a **separate database**: `createStore("contentgenie-offline-queue", "actions")`.

2. **Next.js server actions cannot be called from service workers.** The `Next-Action` hash is unstable across deploys, and the response format is React Flight (not JSON). Dedicated REST API routes are required for replay.

3. **The existing SW is a classic (non-module) worker.** To import `idb-keyval` in the SW, it must be migrated to a module worker (`{ type: "module" }`). Module SWs are supported in Chrome 91+, Edge 91+, Safari 16.4+.

## Options Considered

### Option A: Client-side queue with Background Sync API + `online` event fallback (chosen)

Queue mutations in a dedicated `contentgenie-offline-queue` IndexedDB database via `idb-keyval`. Components detect offline state and enqueue instead of calling server actions. The service worker (migrated to module type) registers a `sync` event tag; on `sync` fire, it replays queued actions via dedicated per-action API routes. Browsers without Background Sync fall back to the `online` event listener in the client, which calls the same replay logic. Optimistic state is persisted to the IDB offline-cache so it survives page reloads before sync completes.

- **Pros:** Uses existing `idb-keyval` dependency. No new libraries. Progressive enhancement: Background Sync when available, `online` fallback otherwise. Queue persists across page reloads. Testable — queue logic is pure functions over IndexedDB. Queue deduplication prevents conflicting entries.
- **Cons:** Requires 4 new API routes (one per action). Service worker migration from classic to module. Two code paths for replay (SW sync + client fallback).

### Option B: Service worker intercept all server action POSTs

Intercept server action `fetch` calls in the service worker, detect failures, and auto-queue/retry.

- **Pros:** Transparent to components — no UI code changes.
- **Cons:** Next.js server actions use `Next-Action` hashes that change across deploys — replaying captured requests after a deploy would call the wrong action. Response format is React Flight, not JSON. No optimistic UI possible. Much harder to test.

### Option C: Workbox Background Sync plugin

Use Workbox's `BackgroundSyncPlugin` to automatically retry failed requests.

- **Pros:** Battle-tested retry logic. Handles Background Sync API registration automatically.
- **Cons:** Adds Workbox dependency (~10KB). Same opaque server-action POST problem as Option B. Requires migrating the existing handwritten SW to Workbox, which risks breaking push notification handling (ADR-009). No optimistic UI.

## Decision

Option A. A client-side queue with explicit enqueue/dequeue gives us full control over optimistic UI updates, toast messaging, and retry behavior. Key implementation details:

- **Separate IDB database:** `createStore("contentgenie-offline-queue", "actions")` to avoid conflicts with the existing `contentgenie-offline` database.
- **Dedicated API routes** (not a single batch replay endpoint): `POST /api/library/save`, `POST /api/library/unsave`, `POST /api/subscriptions/subscribe`, `POST /api/subscriptions/unsubscribe`. Each route mirrors the logic of its corresponding server action but returns JSON.
- **Module service worker:** `public/sw.js` migrated to module type (`{ type: "module" }`). The SW accesses the queue via raw IndexedDB helpers (`openSyncDB`, `idbGetAll`, `idbPut`, `idbDelete`) — `idb-keyval` is not imported in the SW due to ESM compatibility constraints in module workers.
- **Queue deduplication:** Uses `entityKey` (e.g., `episode:{podcastIndexId}` or `podcast:{podcastIndexId}`) as dedup key. A save + unsave for the same entity cancels both.
- **Optimistic cache persistence:** On enqueue, also update the IDB offline-cache (`cacheLibrary()` pattern) so optimistic UI survives page reloads before sync completes.
- **401 handling:** Expired Clerk session (401 from replay) drains the queue item rather than retrying — the user will re-authenticate naturally.

## Consequences

- **New files:** `src/lib/sync-queue.ts` (queue CRUD), `src/lib/offline-actions.ts` (action wrappers), `src/hooks/use-sync-queue.ts` (React hook for pending count + replay), `src/app/api/library/save/route.ts`, `src/app/api/library/unsave/route.ts`, `src/app/api/subscriptions/subscribe/route.ts`, `src/app/api/subscriptions/unsubscribe/route.ts`.
- **Modified files:** `public/sw.js` (module migration + sync event handler), `src/components/episodes/save-button.tsx`, `src/components/podcasts/subscribe-button.tsx` (offline-aware toggle), `src/components/pwa/service-worker-registrar.tsx` (module registration + expose registration ref).
- **No schema changes** — offline queue is entirely client-side (IndexedDB).
- **No new dependencies** — uses existing `idb-keyval`.
- **Retry policy:** 3 attempts. Failed items are retried on the next sync trigger (Background Sync event or `online` event — no explicit delay is added by application code; the browser's Background Sync API may impose its own scheduling). After 3 failures, the item is marked `failed`. 401 responses are drained immediately (no retry).
- **Browser support:** Chromium (Background Sync + module SW), Safari 16.4+/Firefox (online event fallback + module SW). Module SW minimum: Chrome 91, Edge 91, Safari 16.4.
