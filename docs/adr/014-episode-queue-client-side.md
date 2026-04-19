# ADR-014: Client-Side Episode Queue with localStorage Persistence

**Status:** Superseded by [ADR-036](036-cross-device-queue-session-sync.md)

> Superseded by ADR-036 on 2026-04-18 — the client-side-only approach was replaced by server-backed cross-device sync. See ADR-036 for the current design.

**Date:** 2026-03-03
**Issue:** [#94](https://github.com/Chalet-Labs/contentgenie/issues/94)

## Context

Issue #94 adds an episode queue with auto-play-next functionality. Users can add episodes to a queue, reorder them via drag-and-drop, and the player automatically advances to the next queued episode when the current one finishes. The queue needs to persist across page navigations and browser sessions.

The key design question is where queue state lives and how it persists:

1. **Server-side (database)** — persist queue to Neon via server action
2. **Client-side (localStorage)** — persist queue to the browser
3. **Hybrid** — client-side primary with optional server sync

## Options Considered

### Option A: Client-side queue in AudioPlayerContext with localStorage (chosen)

Extend the existing `AudioPlayerContext` reducer with queue actions (`ADD_TO_QUEUE`, `REMOVE_FROM_QUEUE`, `REORDER_QUEUE`, `CLEAR_QUEUE`, `PLAY_NEXT`). Queue state is an `AudioEpisode[]` array. Persist the queue to localStorage on every mutation (same pattern as `player-preferences.ts`). Load persisted queue on provider mount.

- **Pros:** Zero latency — queue operations are instant with no network round-trip. Works offline (aligns with the PWA offline-first direction from ADR-011). No schema migration needed. Keeps queue scoped to the device, which matches user mental model (queue is "what I'm listening to right now on this device", not a cross-device playlist). Builds naturally on the existing `useReducer` + localStorage pattern established in ADR-004.
- **Cons:** Queue is device-local — different queues on phone vs. laptop. localStorage has a ~5MB limit (but a queue of 100 episodes at ~200 bytes each is only ~20KB). No server-side analytics on queue usage.

### Option B: Server-side queue in database

Add a `queue_entries` table with `user_id`, `episode_id`, `position`, and persist via server actions.

- **Pros:** Cross-device sync. Server-side analytics.
- **Cons:** Network latency on every queue mutation (add, reorder, remove). Doesn't work offline. Requires schema migration, new server actions, and API routes. Over-engineered for a playback queue — this isn't a playlist feature. The issue explicitly scopes this as device-local.

### Option C: Separate QueueContext

Create a new `QueueContext` alongside `AudioPlayerContext`, with its own provider and hooks.

- **Pros:** Separation of concerns — queue logic doesn't bloat the audio player context.
- **Cons:** Queue state and player state are tightly coupled — `onEnded` must read the queue to auto-play next, `playEpisode` should remove the episode from the queue. Two contexts that need to coordinate creates indirection. The existing triple-context split (API/State/Progress) already separates concerns by update frequency; adding queue state to the State context is natural since queue changes are low-frequency (user-initiated).

## Decision

**Option A** — client-side queue state integrated into `AudioPlayerContext` with localStorage persistence.

## Rationale

- **Matches the issue scope.** The issue says "Queue persists in localStorage (device-local, no server storage)."
- **Minimal new surface area.** Queue is ~5 new reducer actions and ~30 lines of persistence logic, added to an existing well-tested context.
- **Tight coupling is a feature.** The `onEnded` handler already lives in `AudioPlayerProvider`. Adding auto-play-next is a one-line change: check the queue and call `playEpisode`. With a separate context, this requires cross-context coordination.
- **Follows established patterns.** `player-preferences.ts` already demonstrates the localStorage load/save pattern with validation and error handling.

## Consequences

- `AudioPlayerState` gains a `queue: AudioEpisode[]` field.
- `AudioPlayerAPI` gains `addToQueue`, `removeFromQueue`, `reorderQueue`, `clearQueue`, and `playNext` methods.
- A new `src/lib/queue-persistence.ts` module handles localStorage serialization (analogous to `player-preferences.ts`).
- The `onEnded` handler in `AudioPlayerProvider` is extended to auto-play the next queued episode after a 3-second delay.
- If cross-device sync is desired in the future, the queue state shape is already an array of `AudioEpisode` objects that could be persisted server-side without restructuring the client code.
