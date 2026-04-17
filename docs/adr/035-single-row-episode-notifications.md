# ADR-035: Single-Row Episode Notification Lifecycle

**Status:** Accepted
**Date:** 2026-04-17
**Issue:** [#289](https://github.com/Chalet-Labs/contentgenie/issues/289)
**Relates to:** [ADR-009](009-notification-system-architecture.md) (in-app + PWA push notification system)

---

## Context

ADR-009 established a notification system that writes two distinct row types per episode per subscriber:

1. `new_episode` — intended to fire when a new episode is discovered.
2. `summary_completed` — fires when the AI summary is persisted.

In practice both notifications are created from `src/trigger/summarize-episode.ts` immediately after `persistEpisodeSummary` (lines 204–242), within milliseconds of each other. Subscribers receive two push notifications and two in-app rows per episode. Users consistently report the double-buzz as noisy, and the "new episode" notification never fires on discovery — if summarization fails, the user never learns the episode exists.

The push payload already sets `tag: ${type}-${episodeId}` so the device could in principle collapse the two notifications, but the `tag` differs between the two types (`new_episode-42` vs. `summary_completed-42`), so device-side deduplication never takes effect.

## Options Considered

### Option A: Keep two row types, share a `tag`

Unify the push `tag` across both types (e.g. `episode-${episodeId}`) so device-side replacement collapses the pair into one visible notification. Leave DB rows as-is.

- **Pro:** Minimal change. No schema migration.
- **Con:** Still writes two DB rows per episode per subscriber — unread counts double-count, `NotificationList` still shows both. Admin-triggered re-summarization still creates spurious rows. Does not fix the discovery gap.

### Option B: Single-row lifecycle (chosen)

One `notifications` row per `(user_id, episode_id)` pair. The poller INSERTs the row at discovery with body "New episode: …" (`type='new_episode'` preserved for backward compatibility). The summarizer UPDATEs the same row in place once the summary lands: body becomes "Summary ready: …", `isRead` resets to false, `updatedAt` bumps. Both operations dispatch push with the same `tag=episode-${episodeId}`, so the device replaces the visible notification.

- **Pro:** One row per episode per subscriber. One push at discovery, one update push when summary lands (device collapses the update). Subscribers learn about new episodes even when summarization fails. Unread count reflects distinct episodes, not distinct lifecycle events.
- **Con:** Requires a partial unique index on `(user_id, episode_id) WHERE episode_id IS NOT NULL` to enforce idempotency and support `ON CONFLICT` semantics. Admin-triggered re-summarization (no prior row) becomes an intentional no-op for notifications.

### Option C: New `status` column on `notifications`

Add `notification_status: 'pending_summary' | 'summary_ready'` and transition via UPDATE.

- **Pro:** Explicit state machine.
- **Con:** Extra column and enum for information already derivable from `body`. Existing `type` values stay but become redundant. Larger migration and more moving parts than Option B.

## Decision

**Option B: Single-row lifecycle with INSERT-on-discovery / UPDATE-on-summary.**

### Key Design Decisions

1. **Partial unique index.** Add `uniqueIndex("notifications_user_episode_unique_idx").on(userId, episodeId).where(sql\`episode_id IS NOT NULL\`)` to the Drizzle schema. The partial predicate is required because `episodeId` is nullable on `notifications` (ADR-009 left the door open for future non-episode types such as `collection_shared` or `weekly_digest`). Postgres partial unique indexes support `ON CONFLICT` targeting.

2. **Two focused helpers replace one overloaded helper.** `src/trigger/helpers/notifications.ts` splits `createNotificationsForSubscribers` into:
   - `createEpisodeNotifications(podcastId, episodeId, podcastIndexEpisodeId, title, body)` — bulk INSERT keyed on the partial index; `onConflictDoNothing({ target: [userId, episodeId] })` makes it idempotent across poller retries. Called by the poller at discovery. Writes `type='new_episode'`.
   - `markSummaryReady(podcastId, episodeId, podcastIndexEpisodeId, title, body)` — UPDATE-only path. For each subscriber row matching `(user_id, episode_id)`, sets `body`, resets `isRead=false`, bumps `updatedAt`. Returns silently when zero rows match (admin-triggered summaries, late subscribes).
   Both helpers reuse the existing subscriber lookup + realtime push dispatch logic. Both push with `tag=episode-${episodeId}` — the shared tag is what the service worker relies on for device-side replacement.

3. **Type enum stays.** The `type` column keeps `'new_episode' | 'summary_completed'` in the CHECK constraint to avoid a second migration and preserve historical rows. New rows are always written with `type='new_episode'`. The value is no longer semantically meaningful — the lifecycle state is carried by the `body` and `updatedAt` — but the UI never branches on `type` after this change (see Decision 5).

4. **Poller owns creation.** `src/trigger/poll-new-episodes.ts` calls `createEpisodeNotifications` immediately after the batch `episodes` insert. To recover DB ids for newly inserted rows despite `onConflictDoNothing`, the insert gains `.returning({ id, podcastIndexId })` — conflicted (existing) rows are excluded from the returned set by Postgres semantics, so the returned list is exactly the "new for this poll" set.

5. **Summarizer stops creating rows.** `src/trigger/summarize-episode.ts:204–242` replaces its two `createNotificationsForSubscribers` calls with a single `markSummaryReady` call and deletes the `isNewEpisode` branch. Admin-triggered summarization of an episode the user didn't discover via the poller has no prior row to update; this is by design — the user wasn't subscribed at discovery, so a "summary ready" notification would be unexpected.

6. **UI drops type branching.** `NotificationList` renders a single `Podcast` icon regardless of `type`. The component no longer inspects `type` at all.

7. **No production data cleanup.** Existing `new_episode` + `summary_completed` duplicate row pairs remain in the DB until their natural TTL (notifications are user-visible but not indexed on dashboards that would break). New-model rows interleave with legacy rows; the UI renders them identically.

8. **Send-notification-digests unchanged.** The digest task counts unread notifications per user. Under the new model, an episode rediscovered by summarization resets `isRead=false`, so unread count reflects episodes with pending user attention — semantically correct.

## Consequences

- One migration generated by `bun run db:generate` adding the partial unique index. Preview deploys auto-migrate via `drizzle-kit push`; production requires manual `bun run db:push` per the documented schema-change workflow.
- `onFailure` in `summarize-episode` must not write a notification: if summarization fails permanently, the existing "New episode: …" row is the user's awareness vehicle. This matches the current `onFailure` code, which does not touch notifications.
- Admin-triggered `/api/admin/batch-resummarize` and the episode detail page's "Fetch & Summarize" button produce no user-visible notification change unless the user was already subscribed when the poller ran. This is intentional.
- `src/lib/notifications.ts` (`createNotification` / `createBulkNotifications`) is untouched — it serves non-trigger callers and does not overlap with the two new helpers. No callers of these library functions exist today in production code paths that write `summary_completed`; verify during implementation.
- The `tag=episode-${episodeId}` push contract is preserved. The service worker's `showNotification({ tag })` collapses the update into the original notification on all major browsers (Chrome, Firefox, Safari 16.4+).
- Tests are updated across four files (helper, poller, summarizer, `NotificationList`) to reflect the new contract. The old `isNewEpisode=true/false` summarizer tests are removed — that branch is gone.
