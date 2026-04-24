# ADR-019: Sync Queue Hardening

**Status:** Proposed
**Date:** 2026-03-08
**Issue:** [#168](https://github.com/Chalet-Labs/contentgenie/issues/168)

## Context

PR #167 introduced background sync for offline save and subscribe actions (ADR-012). A post-merge review identified 10 medium-severity findings that need resolution. This ADR captures the architectural decisions for the hardening pass.

### Key findings

1. **Manual validation in API routes** — `save/route.ts` has ~80 lines of hand-rolled validation; Zod schemas would be declarative, reusable, and less error-prone.
2. **Duplicate `useSyncQueue` instances** — SaveButton and SubscribeButton each instantiate the hook, creating independent polling intervals, `online` listeners, and state. A React context provider would consolidate to a single instance.
3. **Double-replay race** — Both the service worker (`sync` event) and the client (`online` event / `replayAll`) can fire simultaneously, replaying the same items. No coordination mechanism exists.
4. **`hasPending` misses in-flight items** — `getPending()` only returns `status === "pending"`, so `hasPending` returns false for items currently being replayed.
5. **Stale in-flight recovery** — If the SW or tab crashes mid-replay, items stuck in `in-flight` status are never retried.
6. **No failed-item UX** — Items that exhaust retries show a stale "pending" clock icon indefinitely.
7. **`useTransition` not viable** — React 18 does not support async `startTransition` callbacks. Keep `useState` for loading state.
8. **Clerk email stored as empty string** — `insert(users).values({ email: "" })` persists placeholder data.

## Decisions

### 1. Zod validation for API routes

Add `zod` as a dependency. Create shared schemas in `src/lib/schemas/library.ts`. Replace hand-rolled validation in all 4 sync API routes with `schema.safeParse()`. Schemas are reusable by client-side offline-actions if needed later.

### 2. SyncQueueProvider context

Extract `useSyncQueue` hook internals into a `SyncQueueProvider` context at `src/contexts/sync-queue-context.tsx`. Mount it in `AppShell` (alongside `AudioPlayerProvider`). Components consume sync state via `useSyncQueueContext()`. This eliminates duplicate polling, duplicate `online` listeners, and duplicate state across SaveButton/SubscribeButton.

The existing `useSyncQueue` hook file becomes a thin re-export of the context hook for backwards compatibility during migration.

### 3. `navigator.locks` for replay coordination

Use `navigator.locks.request(lockName, { ifAvailable: true }, callback)` in both the SW `handleSync` and the client `replayAll`. If the lock is held, the caller skips replay (the other context is already handling it). This prevents double-replay races.

Fallback: if `navigator.locks` is unavailable (older browsers), the existing `isSyncingRef` guard in the client still prevents client-side double-entry, and the SW operates independently (acceptable since these browsers also lack Background Sync).

### 4. `hasPending` includes in-flight items

Change `refreshQueue` to fetch all non-dequeued items (pending + in-flight), not just pending. The `hasPending` callback checks for both statuses. Add a new `getActive()` export to `sync-queue.ts` that returns items with `status === "pending" || status === "in-flight"`.

### 5. Stale in-flight recovery

Add `resetStaleInFlight()` to `sync-queue.ts`: scans all items, resets any with `status === "in-flight"` back to `"pending"`. Call it:

- In the SW `activate` handler (safe — fires once per SW lifecycle).
- In the `SyncQueueProvider` initial mount effect.

This handles both SW crashes and tab crashes.

### 6. Failed-item indicator

Add a `hasFailed(entityKey)` function to the sync queue context. SaveButton and SubscribeButton show an `AlertCircle` icon (instead of `Clock`) when `hasFailed` returns true, with a tooltip or `title` attribute explaining the failure. The existing `clearFailed()` function can be exposed for a "retry all" UX later.

### 7. Loading state — keep `useState`

`useTransition` with async callbacks requires React 19. The project is on React 18 / Next.js 14. Keep `useState` for `isLoading`. Both buttons already handle errors; SaveButton needs a `try/catch` added for consistency with SubscribeButton.

### 8. Clerk email — use `clerkClient` lookup

Replace `email: ""` with a lookup: `const user = await clerkClient().users.getUser(userId); const email = user.emailAddresses[0]?.emailAddress ?? "";`. This applies to all 4 API routes and the server actions that do the same insert. Wrap in try/catch so a Clerk API failure doesn't block the mutation.

## Consequences

- **New dependency:** `zod` (runtime validation).
- **New files:** `src/lib/schemas/library.ts`, `src/contexts/sync-queue-context.tsx`.
- **Modified files:** All 4 API routes, `src/lib/sync-queue.ts`, `src/hooks/use-sync-queue.ts`, `src/components/episodes/save-button.tsx`, `src/components/podcasts/subscribe-button.tsx`, `src/components/layout/app-shell.tsx`, `public/sw.js`, plus server actions with `email: ""`.
- **No schema changes** — `email` column already exists and accepts empty string.
- **Browser support unchanged** — `navigator.locks` has the same support profile as module service workers (Chrome 69+, Safari 15.4+, Firefox 96+).
