# ADR-021: Listen History Tracking

**Status:** Proposed
**Date:** 2026-03-11
**Issue:** [#186](https://github.com/Chalet-Labs/contentgenie/issues/186)

## Context

Issue #186 adds listen history tracking as part of the dashboard redesign (#185). Users want to see which episodes they have listened to, how far they got, and whether they completed them. This requires:

1. A new database table to record listen events
2. A server action to record/update listen events via upsert
3. Integration with the existing audio player context to fire events at the right moments

The audio player context (ADR-004) already has ref-based timer patterns for session save, ARIA announcements, and stall detection. Listen history tracking follows the same pattern.

## Options Considered

### Option A: Threshold-based fire-once per episode (chosen)

Record a listen event when `audio.currentTime >= 30s` for the first time per episode session. Record completion on the `ended` event. Use a `Set<string>` ref to prevent duplicate fires per episode within the same player lifecycle.

- **Pros:** Simple, deterministic. One server call per episode per play session (two if completed). No risk of flooding the server on seek/scrub. Matches industry convention for "listened" (30s threshold).
- **Cons:** Doesn't capture intermediate progress (e.g., paused at 45 minutes of a 60-minute episode). Progress tracking is limited to "started" and "completed".

### Option B: Periodic progress updates (debounced)

Debounce progress updates every N seconds (e.g., 30s or 60s) throughout playback.

- **Pros:** Captures intermediate progress. Could resume playback from last position.
- **Cons:** Many more server calls. Overlaps with the existing `savePlayerSession` localStorage mechanism (which already saves position every ~5s). The issue scope specifies `listenDurationSeconds` and `completedAt`, not resumable progress — that's a separate concern.

### Option C: Batch on unload

Accumulate events in memory and flush on `beforeunload` or `visibilitychange`.

- **Pros:** Minimal server calls.
- **Cons:** `beforeunload` is unreliable (mobile browsers, force-quit, crash). Data loss is unacceptable for analytics. The `sendBeacon` API could help but adds complexity for marginal benefit over Option A.

## Decision

**Option A** — threshold-based fire-once per episode.

## Rationale

- **Matches issue scope.** The issue asks for `startedAt`, `completedAt`, and `listenDurationSeconds` — a binary started/completed model, not continuous progress.
- **Minimal server load.** At most 2 server calls per episode play (start + complete). Fire-and-forget with `void` — never blocks playback.
- **Follows existing patterns.** The player context already uses ref-based timers and guards. Adding a `listenHistoryFiredRef` (Set) and `listenHistoryTimerRef` (timeout) is consistent with `sessionSaveTimerRef`, `ariaTimerRef`, etc.
- **No overlap with session restore.** Session restore (localStorage) handles "resume where I left off." Listen history (database) handles "what have I listened to." Separate concerns, separate mechanisms.

## Schema Design

```
listen_history
├── id: serial PK
├── userId: text FK → users.id (CASCADE) NOT NULL
├── episodeId: integer FK → episodes.id (CASCADE) NOT NULL
├── podcastIndexEpisodeId: bigint NOT NULL (denormalized PodcastIndex episode ID)
├── startedAt: timestamp NOT NULL (when 30s threshold was crossed)
├── completedAt: timestamp (nullable, set on ended)
├── listenDurationSeconds: integer (nullable, total seconds listened)
├── createdAt: timestamp NOT NULL
├── updatedAt: timestamp NOT NULL
└── UNIQUE(userId, episodeId)  → enables upsert
```

The `podcastIndexEpisodeId` column is denormalized from the `episodes` table. While it is reachable via the `episodeId` FK join, it is included per the issue #186 spec to support dashboard queries that may need the PodcastIndex ID without joining `episodes` (e.g., linking out to PodcastIndex or deduplicating across data sources).

The composite unique constraint on `(userId, episodeId)` means one row per user-episode pair. Subsequent listens preserve `startedAt` (first listen time), update `completedAt`, and keep the longest `listenDurationSeconds` via `onConflictDoUpdate`.

## Consequences

- The `listen_history` table is added to `src/db/schema.ts` alongside existing tables.
- Relations are added to both `usersRelations` and `episodesRelations` (v1 `relations()` API).
- A new server action file `src/app/actions/listen-history.ts` keeps the action separate from the existing `library.ts` (single responsibility).
- The audio player context gains two new refs but no new reducer actions or state fields — listen history is entirely side-effect-driven.
- Dashboard queries can JOIN on `listen_history` to show recently listened episodes.
- Migration: `bun run db:generate && bun run db:push` after schema change. Preview deploys auto-migrate; production requires manual push (per existing workflow).
