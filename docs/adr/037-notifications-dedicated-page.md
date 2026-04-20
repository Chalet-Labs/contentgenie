# ADR-037: Dedicated `/notifications` Page + `isDismissed` Schema Addition

**Status:** Proposed
**Date:** 2026-04-20
**Issue:** [#303](https://github.com/Chalet-Labs/contentgenie/issues/303)
**Relates to:** [ADR-009](009-notification-system-architecture.md) (in-app + PWA push notification system), [ADR-035](035-single-row-episode-notifications.md) (single-row episode notification lifecycle)

---

## Context

The current notification UX is a header bell `Popover` (`src/components/notifications/notification-bell.tsx`) that fetches up to 20 rows on open, shows a compact list (`NotificationList`), and supports two actions: mark-one-read on click-through and mark-all-read. It has several limitations:

- **Surface area.** Truncated 2-line rows in a 20rem popover hide the signal that differentiates episodes (worth-it score, topics). Users can't quickly triage which episodes are worth their time from the popover alone.
- **No dismissal.** Rows persist until they age out — subscribers to high-volume feeds build up a backlog of "already seen, don't care" notifications with no way to clear them.
- **No pagination.** The list caps at 20 rows with no "load more". Older notifications are unreachable through the UI.
- **No inline actions.** Users who want to queue an episode for later must click through to the episode page, defeating the purpose of a notification list.
- **Click-to-mark-read is implicit.** `NotificationList` marks a row read on click-through to the episode. Users who simply glance at the popover to scan new activity have no way to declare "I've seen these" without navigating away.

A dedicated `/notifications` route resolves these by giving each row enough real estate for a worth-it score badge, topic chips, an "Add to queue" button, and a dismiss button — while supporting 50-row pagination, filter tabs, and explicit mark-as-read.

This change also requires a schema addition: `notifications.isDismissed boolean DEFAULT false NOT NULL`. Without it, dismissed rows either (a) delete permanently, losing the ability to recover from accidental dismissals, or (b) reuse `isRead` — conflating two orthogonal states. A separate flag is cheap, reversible, and semantically clean.

## Options Considered

### Option A: Keep the popover, grow it

Expand the popover to 24rem wide and add inline actions inline. Cap at 20 rows.

- **Pro:** No route, no schema change.
- **Con:** Popovers don't scroll well on mobile. 20-row cap leaves the backlog problem unsolved. Topic chips and worth-it badges fight the popover for horizontal space.

### Option B: Dedicated `/notifications` page (chosen)

New `/notifications` route in the `(app)` group. Server component fetches the first 50 rows; client component handles filter tabs, load-more, optimistic dismiss, and mark-as-read. Bell becomes a link with an unread badge — no popover.

- **Pro:** Full-width rows carry worth-it score + topic chips + actions without crowding. 50-row pages with "load more" unlock the full backlog. Mobile gets a normal scrollable page instead of a popover. Inline "Add to queue" reuses `AddToQueueButton`. Explicit dismiss is possible with a proper confirmation UX.
- **Con:** One more route, one schema migration, a production drift risk (manual `doppler run --config prd -- bunx drizzle-kit push` required — see [ADR-002](002-preview-database-migrations.md) and the Feb 2026 `worth_it_reason` incident documented in project memory).

### Option C: Soft-delete (row disappears on dismiss, hard-deleted later)

Skip `isDismissed`, run a scheduled job to delete dismissed rows after 30 days.

- **Pro:** No extra column.
- **Con:** Immediate deletion breaks optimistic-rollback UX — once the row is gone, reversing a failed dismiss requires re-fetching. A scheduled deletion job is extra infrastructure for a concern better served by a filter clause.

## Decision

**Option B: Dedicated `/notifications` page backed by an `isDismissed` boolean column.**

### Key Design Decisions

1. **Schema addition.** Add `isDismissed: boolean("is_dismissed").default(false).notNull()` to the `notifications` table in `src/db/schema.ts`. NOT NULL with a default backfills atomically on Postgres. No index — the column is selected via `getNotifications` which already filters by `userId` (indexed) and orders by `createdAt` (indexed); filtering `isDismissed=false` in-memory on the per-user slice is fine at realistic row counts. If a single user ever accumulates >10k notifications the partial index `WHERE is_dismissed = false` can be added later.

2. **Server actions.**
   - `getNotifications(limit = 50, offset = 0)` extended: default limit bumped from 20 → 50; return shape gains `worthItScore`, `audioUrl`, `artwork`, `duration` from the `episodes` join; WHERE clause gains `eq(notifications.isDismissed, false)` so dismissed rows are never returned.
   - `dismissNotification(notificationId)` new: auth-scoped UPDATE setting `isDismissed=true` where `(id, userId)` match. Mirrors `markNotificationRead`'s contract — returns `{ success: true }` or `{ success: false, error }`.
   - `getEpisodeTopics(episodeIds: number[])` new helper in `src/app/actions/notifications.ts` (or `src/lib/episode-topics.ts` if reused outside notifications — we scope it to `notifications.ts` for v1). Returns `Map<episodeId, string[]>`. Queries `episodeTopics` joined by `inArray(episodeTopics.episodeId, episodeIds)`, orders by `topicRank` ASC nulls last then `relevance` DESC, caps to 3 topic names per episode. Called server-side from `app/(app)/notifications/page.tsx` with the first-page episode ids.

3. **Routing and rendering.**
   - `src/app/(app)/notifications/page.tsx` — server component. Calls `auth()`, calls `getNotifications(50, 0)`, extracts non-null episodeIds from the first page, calls `getEpisodeTopics(episodeIds)`, passes `{ initialItems, initialHasMore, topicsByEpisodeId }` to the client component. Exports `metadata` (title/description) alongside the default export — no other exports (page.tsx export constraint).
   - `src/components/notifications/notification-page-list.tsx` — client component. Owns tab filter state (`all | unread | read`), accumulated items (state), load-more via `useTransition` calling `getNotifications(50, currentOffset)`, optimistic dismiss via `useOptimistic` wrapping the dismissed-id filter, mark-as-read on explicit row click and on "Mark all as read" button. Renders topic chips using the pre-fetched `topicsByEpisedId` map; newly-loaded pages fetch their topics via a second round-trip when "Load more" resolves (same `getEpisodeTopics` action).

4. **Bell becomes a link.** `src/components/notifications/notification-bell.tsx` collapses to a `<Link href="/notifications">` wrapping the bell icon + unread badge. It still polls `getUnreadCount` every 60s (the current cadence) so the badge stays fresh. Popover, `useState(isOpen)`, `getNotifications` fetch-on-open, and the inline `markAllNotificationsRead` wiring are removed. The existing `NotificationList` component in `src/components/notifications/notification-list.tsx` is no longer referenced at runtime after this change. **We delete it** along with its test file — leaving unused code is the refactor-cost-economics lint the project memory calls out explicitly (see `feedback_refactor_cost_economics.md`).

5. **Filter tabs are client-side only.** Tabs operate on the accumulated `items` array, never re-fetching per tab. This matches the research finding and keeps pagination state consistent across tab switches. Install shadcn Tabs: `bunx shadcn@latest add tabs`.

6. **Optimistic dismiss with rollback.** Use `useOptimistic` + `useTransition`. On success, the server confirms and the item stays removed. On failure, `useOptimistic`'s automatic revert re-inserts the row at its original position (structural — no splice). A `toast.error` with a Retry action fires on failure, calling the same dismiss handler.

7. **Mark-as-read triggers.** Only three: (a) user clicks a row, (b) user clicks "Mark all as read", (c) user navigates from a row to the episode page (click-through is the same as (a) in terms of the server call). **Visiting `/notifications` does NOT clear unread.** The bell badge is sourced from `getUnreadCount`, which counts unread+not-dismissed rows. Page visit alone leaves unread count unchanged. This is the issue's explicit requirement.

8. **Topic chips are visual-only.** Render via `Badge variant="secondary"` from `src/components/ui/badge.tsx`. No `onClick`, no filter-by-topic in v1. Up to 3 chips per row — the 4th and beyond are truncated.

9. **Empty state.** Reuse the inline pattern already in `NotificationList` (icon + muted text in a flex-column container) with more vertical breathing room (`py-24`) and a friendlier message ("You're all caught up"). No shared `EmptyState` component in the codebase today — we do not create one for this feature; that would be speculative abstraction.

10. **Production schema drift.** The migration MUST be applied manually to production (`doppler run --config prd -- bunx drizzle-kit push`) before or alongside the code deploy. The `worth_it_reason` incident (Feb 2026) caused 500s across the episode table because Drizzle selects all schema columns — the same risk applies here. The PR test plan includes this step as a VERIFY.

## Consequences

- One migration generated by `bun run db:generate` adding `is_dismissed` with default `false`. Preview auto-migrates; **production is manual** (see Key Design Decision 10).
- `NotificationBell` shrinks from ~110 lines to ~40; its stories file and test file simplify accordingly. The popover dependency (`@/components/ui/popover`) is removed from this component (still used elsewhere).
- `NotificationList` and its stories/tests are **deleted**. Its test assertions migrate into the new `NotificationPageList` test suite.
- `getUnreadCount` gets one additional WHERE clause (`eq(notifications.isDismissed, false)`) so the badge doesn't count dismissed-but-unread rows.
- Topic chips are a one-way display today. If users start asking "why can't I click the topic?" we file a v2 issue for filter-by-topic; we don't pre-build it.
- `markNotificationRead` and `markAllNotificationsRead` keep their current signatures — the page triggers them on explicit user action only.
- Bell stays poll-based (60s) — we do not migrate to SSE/websocket in this PR. That's an orthogonal optimization.
