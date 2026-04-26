# ADR-041: Auto-Dismiss Notifications on Episode Queue or Listened Action

**Status:** Accepted
**Date:** 2026-04-26
**Issue:** [#362](https://github.com/Chalet-Labs/contentgenie/issues/362)
**Relates to:** [ADR-009](009-notification-system-architecture.md), [ADR-035](035-single-row-episode-notifications.md), [ADR-036](036-cross-device-queue-session-sync.md), [ADR-021](021-listen-history-tracking.md)

---

## Context

Today, acting on an episode notification (queueing the episode, marking it listened, completing playback) leaves the corresponding `notifications` row sitting in the bell and on `/notifications` until the user manually dismisses it. This forces a redundant second click for every consumed notification — the user has to "act" on the episode, then "dismiss" the notification of the episode they just acted on.

Per ADR-035, `notifications` is single-row per `(user_id, episode_id, type='new_episode')` with `summary_completed` rows still possible (legacy + future). Both row types carry `is_dismissed`, and every read path (`getNotifications`, `getUnreadCount`, `getNotificationSummary`, `getEpisodeTopics`) already filters on `is_dismissed = false`. Nothing in the schema needs to change to make "the notification is gone" mean "is_dismissed = true."

The action surface already has well-isolated server actions: `recordListenEvent` (in `listen-history.ts`) and `setQueue` (in `listening-queue.ts`). Every queue mutation flows through `setQueue` — there is no per-item `addToQueue` server action by design (ADR-036 — atomic replace-all to avoid ordering races). Every "listened" event flows through `recordListenEvent({ completed: true })`.

Client refresh of the bell badge and `/notifications` list already follows an event-bus pattern (`src/lib/events.ts` — `LISTEN_STATE_CHANGED_EVENT`, `BOOKMARK_CHANGED_EVENT`, `PINS_CHANGED_EVENT`) where mutating components dispatch a `CustomEvent` and reading components subscribe in `useEffect`.

## Options Considered

### Option A: Server-side dismissal in shared actions + bus event with `episodeIds` payload (chosen)

- New internal helper `dismissNotificationsForEpisodes(userId, episodeIds[])` in **`src/app/actions/_internal/dismiss-notifications.ts`** (a plain TypeScript module **without** a `"use server"` directive). Living outside any `"use server"` file is load-bearing: every exported `async function` from a `"use server"` file becomes a wire-callable server-action endpoint, and this helper takes `userId` as a parameter (no `auth()` inside) — exposing it as an endpoint would let any network caller dismiss any user's notifications. A non-`"use server"` module can only be imported in server contexts; the bundler refuses to ship it to the client. Bulk `UPDATE notifications SET is_dismissed = true WHERE user_id = $1 AND is_dismissed = false AND episode_id = ANY($2)`. Errors are caught and logged; the helper never throws.
- Called from inside `recordListenEvent` (when `completed === true`) and inside `setQueue` (after the queue write commits).
- New `NOTIFICATIONS_CHANGED_EVENT` constant in `src/lib/events.ts`, dispatched as `new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, { detail: { episodeDbIds: number[] } })`. The `episodeDbIds` payload carries the integer `episodes.id` values that were just dismissed (or, for the optimistic client `addToQueue` dispatch, an empty array — see Decision Notes below). The payload is required because `NotificationPageList` is a client component that initializes `useState(initialItems)` on mount and **does not** re-read props on parent re-render. A `router.refresh()`-only refresh would update the RSC tree and pass new props but the local `items` state would ignore them, leaving the dismissed row visible until full reload. With the payload the subscriber filters local state directly: `setItems(prev => prev.filter(n => n.episodeDbId === null || !ids.has(n.episodeDbId)))`.
- Emitted from every client surface that triggers one of those server actions: `ListenedButton`, `audio-player-context.addToQueue`, and `audio-player-context.onEnded`.
- `NotificationBell` re-runs `fetchUnreadCount` (payload-agnostic). `NotificationPageList` filters local `items` by `detail.episodeDbIds`. Both subscribers also call `router.refresh()` so the RSC source-of-truth re-runs in the background for the next navigation / hard refresh — but the user-visible immediate update is the local-state filter.

- **Pros:** Centralizes the invariant ("notifications about an episode disappear when the episode is consumed") at the action layer — every current and future caller of `setQueue` / `recordListenEvent` gets the dismissal automatically. No new mutation endpoint, no separate API surface, no schema change. Idempotent by construction (the `is_dismissed = false` filter makes repeated calls zero-row UPDATEs). Failure isolation: dismissal is best-effort — a DB hiccup on the dismiss UPDATE never blocks the primary action (queue save, listen-history insert).
- **Cons:** Couples notifications to two unrelated action modules (small, explicit, single-call coupling). Three client dispatch sites must be remembered (mitigated: dispatch sits at the same call site as the server action invocation, so adding a new caller of `setQueue` / `recordListenEvent` is the one place the developer is already thinking).

### Option B: Separate `dismissNotificationsForEpisode(episodeId)` server action called from the client

A public server action that the client invokes alongside (or after) `setQueue` / `recordListenEvent`.

- **Pros:** Loose coupling — `notifications.ts` doesn't need to be referenced from `listen-history.ts` / `listening-queue.ts`.
- **Cons:** Two server round-trips per action where one would do. Every existing and future caller has to remember to invoke the second action — the "stale clutter" bug returns the moment any caller forgets. Defeats the whole point of centralizing the invariant. Doubles the surface area for tests.

### Option C: Client-only dismissal (filter notifications client-side after action)

The client hides matching rows from the rendered list without a server write.

- **Pros:** Zero server coupling.
- **Cons:** State is per-tab — the next page load, the next device, the bell badge from another window all still show the stale notification. Doesn't solve the problem; it cosmetically hides it for one render.

### Option D: Trigger.dev background sweep that auto-dismisses notifications for queued/listened episodes

A scheduled task that periodically reconciles notifications against listen-history and queue state.

- **Pros:** Decouples the dismissal from the action path entirely.
- **Cons:** Latency — users see stale notifications until the next sweep tick (5–15 minutes typical). Cost — a cron task that 99% of the time has nothing to do. Solves the wrong problem: this is event-driven, not state-driven.

## Decision

**Option A.** Server-side dismissal inside `recordListenEvent` and `setQueue`, plus a new `NOTIFICATIONS_CHANGED_EVENT` for client-side refresh of the bell and `/notifications` page.

## Rationale

- **Invariant lives where it's enforced.** "Acting on an episode dismisses its notifications" is a server-side data invariant. Encoding it in the actions that own those mutations means every caller — current `ListenedButton` / `AddToQueueButton` / audio-player onEnded **and** any future code path that hits `setQueue` or `recordListenEvent` — gets it for free. The bug "I added a new caller and forgot to dismiss" is structurally impossible.
- **No schema change is required.** `is_dismissed` already exists; every reader already filters on it. The behavior change is purely additive on the write side.
- **Idempotency falls out naturally.** The `is_dismissed = false` predicate means a repeated `setQueue([same queue])` updates zero rows on the second call. No version tokens, no dedup state, no client cache.
- **Failure isolation is explicit.** The dismiss helper swallows its own errors. Listen-history and queue writes — both of which the user actively cares about — never see a failure caused by the dismiss path.
- **One-way is correct.** Per the issue, dismissal does not reverse on queue removal. This matches every other `isDismissed` write in the codebase and avoids reconciliation races (queue removal triggering an undismiss that races with a fresh dismiss from a re-add).
- **Client refresh reuses an established pattern.** `LISTEN_STATE_CHANGED_EVENT` and `BOOKMARK_CHANGED_EVENT` already prove the event-bus shape; adding a third constant requires no new abstractions.

## Decision Notes

- **Why a separate non-`"use server"` module?** Every exported `async function` from a `"use server"` file becomes a wire-callable RSC server-action endpoint. The dismiss helper takes `userId` as a plain parameter and contains no `auth()` call (intentionally — its callers have already authenticated). If it lived in `notifications.ts`, a network attacker could invoke it with arbitrary userIds and dismiss any user's notifications. Moving it to `src/app/actions/_internal/dismiss-notifications.ts` (no `"use server"` directive) makes it a regular server-side import only — the function is unreachable from the wire.
- **No optimistic `addToQueue` dispatch.** Earlier iterations of this feature fired a `NOTIFICATIONS_CHANGED_EVENT` with `{ episodeDbIds: [] }` immediately on `addToQueue` so the bell decremented without waiting for the debounced `setQueue` write. The empty payload forced `NotificationPageList` into a `getNotifications` re-fetch that replaced the rendered list — losing the supplemental `topicsByEpisode` and `listenedIds` enrichment that `handleLoadMore` performs. The optimistic event was removed; the debounced `setQueue` resolution (~1.5s later) is the single dispatch site for queue-driven dismisses, carrying the server-resolved `dismissedEpisodeDbIds` for in-place filtering.
- **All client dispatches carry confirmed dismisses.** `dismissNotificationsForEpisodes` returns the episode ids of the rows it actually flipped (via Drizzle `.returning()`); `recordListenEvent` and `setQueue` thread that array through their success result. `ListenedButton` and `audio-player-context.onEnded` only dispatch when the array is non-empty — so a silent dismiss-helper failure can no longer cause the UI to "remove" a notification that's still live in the database.
- **Why the dispatch after the debounced `setQueue`?** Without it, the bell would self-correct only on the 60s poll. The audio-player provider observes the debounced `setQueue` resolution path and fires `NOTIFICATIONS_CHANGED_EVENT` with the server-resolved `episodeDbIds` so subscribers reconcile against truth.

## Consequences

- New file `src/app/actions/_internal/dismiss-notifications.ts` — non-`"use server"` module, single export `dismissNotificationsForEpisodes(userId, episodeIds)`. Not wire-callable.
- `recordListenEvent` return shape changes: `ActionResult` → `ActionResult<{ dismissedEpisodeDbIds: number[] }>`. Mirrors `setQueue`'s success shape: the action returns the episode ids whose notifications were actually flipped (empty array when `completed !== true`, when the dismiss helper finds nothing to flip, or when it errors). Existing call sites that destructure only `success` / `error` are unaffected. Callers that bind the result to a stricter generic (e.g. `ActionResult<void>`) would need to widen — `data` is optional and absent on `success: false`. `rg "recordListenEvent\("` confirms no such typed call sites today.
- `src/app/actions/listening-queue.ts` adds one extra query inside `setQueue`: a `SELECT id FROM episodes WHERE podcast_index_id = ANY(...)` to resolve the queue's `userQueueItems.episodeId` (text / `PodcastIndexEpisodeId`) → `notifications.episodeId` (integer / `episodes.id`). Skipped entirely when the queue is empty. Bounded by queue length (50–200 items max). Failure of the resolution SELECT or the helper UPDATE is contained in an inner try/catch so it never flips the action's `{ success: true }` to a failure.
- `src/app/actions/listen-history.ts` adds one extra UPDATE inside `recordListenEvent` when `completed === true`, in its own inner try/catch. Same isolation rule.
- Three dispatch sites in client code, each gated on `dismissedIds.length > 0`:
  1. `ListenedButton` (after `recordListenEvent` succeeds) — `detail: { episodeDbIds: result.data.dismissedEpisodeDbIds }`.
  2. `audio-player-context` debounced `setQueue` resolution — `detail: { episodeDbIds: result.data.dismissedEpisodeDbIds }`.
  3. `audio-player-context.onEnded` after `recordListenEvent` resolves — `detail: { episodeDbIds: result.data.dismissedEpisodeDbIds }`.
- Two subscribers:
  - `NotificationBell` — payload-agnostic; calls `fetchUnreadCount`.
  - `NotificationPageList` — filters local `items` state directly (`setItems(prev => prev.filter(...))`) and calls `router.refresh()` so the SSR snapshot is fresh on the next navigation. An empty `episodeDbIds` payload is treated as a no-op event (defensive guard; production sites only fire on non-empty arrays).
- The existing fire-and-forget `recordListenEvent` call at the end of `audio-player-context.onEnded` becomes `.then()`-attached so the dispatch fires after server confirmation. The async block already exists for listen-history retry counting in the started-event path, so the pattern carries over.
- `setQueue` return shape changes: `ActionResult` → `ActionResult<{ dismissedEpisodeDbIds: number[] }>`. Empty queue returns `{ success: true, data: { dismissedEpisodeDbIds: [] } }`.
- No new database indexes required: the existing per-user notifications indexes cover the predicate.
- Pre-existing notifications for episodes already in the queue / already listened are **not** backfilled. The feature applies only to actions taken after ship.
- `onEnded` (and `ListenedButton`) only fire `NOTIFICATIONS_CHANGED_EVENT` when the dismiss helper actually flipped at least one row. If the played episode has no `summary_completed`/`new_episode` notification, the helper returns `[]` and no event is dispatched — the bell/list don't see redundant traffic.
