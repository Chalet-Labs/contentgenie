# ADR-036: Cross-Device Queue & Player Session Sync

**Status:** Proposed
**Date:** 2026-04-18
**Issue:** [#282](https://github.com/Chalet-Labs/contentgenie/issues/282)
**Supersedes:** [ADR-014](014-episode-queue-client-side.md) (client-side queue with localStorage)

## Context

ADR-014 made the queue device-local, stored in `localStorage` only. Twelve
months later, user feedback says the opposite is expected: people use
ContentGenie on a mobile PWA **and** a desktop browser, and the queue and
resume-position must follow them across devices (Spotify / Apple Podcasts
norm). The same is true for the currently-playing episode — pausing on phone
and opening laptop should resume at approximately the same timestamp.

Today:

- `src/lib/queue-persistence.ts` persists the queue to `localStorage` under
  `contentgenie-player-queue`.
- `src/lib/player-session.ts` persists `{ episode, currentTime, savedAt }` to
  `localStorage` under `contentgenie-player-session` with a 24h TTL.
- `src/contexts/audio-player-context.tsx` hydrates and writes to both on
  mutations. No server round-trip exists.

`localStorage` is per-origin-per-browser; an installed PWA and desktop browser
are completely isolated buckets. Nothing to reconcile — there is simply no
wire.

Competing constraints for a server-backed replacement:

- Queue mutations are frequent during drag-and-drop reorder — must not hammer
  Neon or make the UI wait on the network.
- Users rarely mutate the queue on two devices simultaneously, so the system
  should optimize for the common case (one active device) and accept a
  reasonable behaviour in the rare concurrent case.
- The audio player works for episodes the user has never saved (search
  results), so the server-side store cannot assume the episode exists in
  `episodes` / `userLibrary`.
- No new dependencies; reuse existing Drizzle + server-action patterns.

## Options Considered

### Option A: `setQueue` replace-all + last-commit-wins + denormalized fields (chosen)

Add `user_queue_items` and `user_player_session` tables with **denormalized**
episode fields (title, audioUrl, artwork, duration, chaptersUrl).

One mutation endpoint for the queue:

```ts
setQueue(episodes: AudioEpisode[]): Promise<{ success: true } | { success: false; error: string }>
```

The server transaction deletes all rows for the user and inserts the supplied
array; `position = array_index`. No per-operation `add` / `remove` / `reorder`
actions. Client optimistic reducer dispatches remain instant; a trailing-edge
1500ms debounce collapses rapid reorders into a single write whose payload is
the latest committed state. Conflict resolution is commit-order: the last
`setQueue` wins; no version token, no merge.

Session uses a single-row upsert per user; same last-write-wins semantics with
the existing 5s client-side throttle.

- **Pros:**
  - Ordering races are impossible to express — there is only one
    mutation path, and its input is a full snapshot.
  - Last-commit-wins needs no version/etag handshake; the action code is
    trivially correct.
  - Denormalized episode fields mean the queue works for non-library
    episodes (search results) without coupling to the episode-ingest
    pipeline.
  - Debounce turns a 50-event drag into one ~8 KB write.
  - Client reducer stays optimistic — user-perceived latency is zero.
- **Cons:**
  - Wire payload scales with queue length (acceptable: 50 items ≈ 8 KB; 200
    items ≈ 30 KB).
  - Concurrent mutations on two devices: one device's write disappears on the
    other's next focus refetch. Documented and acceptable per product scope.
  - Denormalization means renames/artwork changes aren't reflected in queue
    items after they were enqueued. Acceptable: an episode's immutable
    identity is its `podcastindex` id; metadata drift is cosmetic.
  - Two unique indexes (`(userId, episodeId)` and `(userId, position)`)
    impose correctness obligations on the action — every write must produce
    dense, zero-based positions.

### Option B: Per-operation actions (`addToQueue`, `removeFromQueue`, `reorderQueue`)

Four actions, each mutates one row. Reorder sends the new full order or uses
relative swaps.

- **Pros:** Smaller wire payloads per op. More granular telemetry.
- **Cons:** Ordering races are structural — a sequence of `reorder` and
  `remove` calls from the client can arrive at the server out of order, and
  the server cannot detect this without version tokens. Either we add
  `updatedAt`-based optimistic concurrency (more code, more client round-trip
  handling) or we ignore the problem and ship subtle bugs. The debounce
  strategy doesn't apply cleanly — you either debounce each op type
  separately (races persist across types) or you serialize everything into a
  queue, at which point you've reinvented `setQueue` with extra steps.

### Option C: Normalized FK to `episodes.id` + upsert on enqueue

`user_queue_items.episodeId` references `episodes.id`. Every queue mutation
ensures the episode exists by calling `upsertPodcast` + episode upsert.

- **Pros:** Integrity. Metadata stays fresh via the ingest pipeline.
- **Cons:** Couples queue mutations to the full podcast/episode ingest path
  for no user-visible benefit. Search-result episodes with incomplete
  metadata get partial rows written to `episodes`. Blast radius of any
  ingest-pipeline bug now includes queue mutations. Slower cold enqueue.

### Option D: Realtime push (websocket / SSE / Supabase-style)

Server pushes queue changes to all devices in real time.

- **Pros:** Two simultaneously-open tabs stay in sync without focus events.
- **Cons:** Realtime infrastructure, connection management, reconnect logic,
  auth over a long-lived transport. Product scope explicitly excludes this
  ("Same-tab realtime sync is explicitly not required"). Overkill.

## Decision

**Option A.** `setQueue` replace-all, last-commit-wins, denormalized episode
fields on both tables, debounced by final state (1500ms trailing edge).

## Rationale

- **Correctness by construction.** A single mutation path that takes a full
  snapshot removes an entire class of bugs (reorder-vs-remove races,
  out-of-order arrivals, position renumbering drift). Tests only need to
  verify that `setQueue([a, b, c])` leaves the DB with exactly those rows.
- **Matches the read path.** Focus-driven refetch is the sync model. The
  server always hands the client a full, ordered snapshot; the client always
  hands the server a full, ordered snapshot. Both directions use the same
  shape.
- **Decouples from episode ingest.** Denormalized fields make the queue
  independent of whether an episode has been saved or summarized. Enqueueing
  from a search result is a 2-query transaction instead of a 4-query chain
  through `upsertPodcast`.
- **Debounce is honest about UX.** Drag-and-drop dispatches 10–30 reorder
  events within a second. A per-op action strategy sprays writes during the
  drag; our strategy sends exactly one write 1.5s after settle. The user sees
  zero latency regardless.
- **Concurrent-device conflict is rare and survivable.** Empirically, a user
  mutating the queue on two devices within the same 30s window is a corner
  case. Documented behaviour ("the most recent commit wins") is simpler to
  explain than "your queue was merged, here's why it looks different."

## Consequences

- Two new tables in `src/db/schema.ts`:
  `user_queue_items` (one row per queue entry, with `(userId, position)` and
  `(userId, episodeId)` unique indexes) and `user_player_session` (one row
  per user, `userId` primary key).
- Two new server-action modules: `src/app/actions/listening-queue.ts` and
  `src/app/actions/player-session.ts`. Both follow the existing return-shape
  contract `{ success: true; data?: T } | { success: false; error: string }`,
  call `auth()` then `ensureUserExists(userId)`, and use Zod validation on
  the `AudioEpisode` payload (mirroring `src/lib/schemas/library.ts`).
- **Name explicitly:** the new modules are `listening-queue` / `player-session`.
  They are **not** the pre-existing `src/contexts/sync-queue-context.tsx` /
  `src/lib/sync-queue.ts` (IndexedDB-backed offline action replay for save /
  subscribe — unrelated). See ADR-012 and ADR-019 for that system.
- `src/contexts/audio-player-context.tsx` is refactored: instant hydrate
  from localStorage cache on mount, then parallel `getQueue()` +
  `getPlayerSession()`, then reconcile per the rules in the issue (pending-
  write guard for queue; never-rewind-active-playback for session).
- `src/lib/queue-persistence.ts` and `src/lib/player-session.ts` are
  downgraded to cache-only helpers. The 24h TTL in `player-session.ts` is
  removed — server is now the source of truth and has no TTL.
- One-time migration on first mount after deploy: if server state is empty
  and local state is non-empty, the client uploads the local snapshot. Safe
  under `setQueue` replace-all semantics; concurrent first-mount on two
  devices is the only racey case and resolves the same way as any concurrent
  mutation (commit-order wins).
- **Supersedes ADR-014.** That ADR explicitly called out "If cross-device
  sync is desired in the future, the queue state shape is already an array
  of AudioEpisode objects that could be persisted server-side without
  restructuring the client code." This ADR cashes that cheque.
- Explicitly **out of scope** for this ADR: realtime push, offline-write
  replay integration with `sync-queue-context`, syncing
  volume/playback-speed (kept device-local per `player-preferences.ts`), and
  a cross-device "Now playing" indicator UI. Each may be revisited
  individually in future issues.
