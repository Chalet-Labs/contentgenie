# ADR-011: Offline Reading via IndexedDB Cache

**Status:** Proposed
**Date:** 2026-02-27
**Issue:** [#89](https://github.com/Chalet-Labs/contentgenie/issues/89)

## Context

Users want to read saved episode summaries, key takeaways, and worth-it scores without an internet connection. The primary use case is commuters and travelers who browse their library while offline. Data should be cached when viewed online and served from the cache when offline, with automatic refresh on reconnection.

The app already has a service worker (`public/sw.js`) for push notifications and static asset caching (ADR-009), but it does not cache API responses or dynamic page data.

## Options Considered

### Option A: `idb-keyval` with client-side cache module (chosen)

A dedicated `src/lib/offline-cache.ts` module wraps `idb-keyval` (573 bytes brotli, zero dependencies) to provide typed cache read/write functions. Page components call cache functions directly after successful data fetches (cache write) and read from cache when offline (cache read). A `useOnlineStatus` hook built on `useSyncExternalStore` detects connectivity.

- **Pros:** Minimal bundle impact. No service worker modifications. Typed cache keys and data shapes. User-scoped (keyed by Clerk `userId`). TTL-limited (7 days). Storage-budget-aware (50MB soft cap). Graceful degradation when IndexedDB is unavailable (Safari private browsing).
- **Cons:** Requires explicit cache calls at each page integration point. Cache is populated only when the user visits pages while online.

### Option B: Service worker runtime caching (Workbox)

Intercept API route responses in the service worker and cache them with a stale-while-revalidate strategy. Uses Workbox for route matching and cache management.

- **Pros:** Transparent to page components — no code changes in pages. Caches all API responses automatically.
- **Cons:** Significantly more complex. Requires modifying the existing service worker (risk of breaking push notifications). Workbox adds ~10KB to the bundle. Cache is not user-scoped without additional logic. Harder to enforce TTL per-resource. Service worker lifecycle complexity (update, activation, skip-waiting).

### Option C: Full IndexedDB library (Dexie.js, localForage)

Use a full-featured IndexedDB wrapper with schema versioning, indices, and query capabilities.

- **Pros:** Rich query API. Schema migrations. Index-based lookups.
- **Cons:** Overkill for key-value cache needs. Dexie.js is ~16KB minified. localForage adds driver complexity. The cache only needs simple get/set/delete by key.

### Option D: localStorage / sessionStorage

Store serialized JSON in localStorage.

- **Pros:** Simplest API. Synchronous reads.
- **Cons:** 5-10MB limit (too small for library data). Blocks the main thread on read/write. No structured clone (must serialize/deserialize). Data types lost across serialization boundary.

## Decision

Option A. `idb-keyval` provides the optimal balance of bundle size, API simplicity, and capability for a key-value cache use case. The explicit cache integration at each page keeps the architecture transparent and debuggable. This follows the project's pattern of using simple, focused libraries rather than heavyweight frameworks (consistent with ADR-004's decision to use React Context over Zustand/Jotai).

## Consequences

- **Library page** and **episode page** gain offline reading capability with a visible "Offline mode" banner.
- Cache is additive — no changes to server actions, API routes, or existing data flow.
- IndexedDB availability is probed on first use. Safari private browsing and older Firefox private browsing degrade gracefully (no caching, no errors).
- `navigator.storage.persist()` is called on first write to protect against automatic browser eviction.
- A 50MB storage budget and 500-entry hard cap prevent runaway growth.
- A new `src/hooks/` directory is introduced for the `useOnlineStatus` hook.
