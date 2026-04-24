# ADR-017: Bookmark-Player Integration Architecture

**Status:** Accepted
**Date:** 2026-03-05
**Issue:** [#95](https://github.com/Chalet-Labs/contentgenie/issues/95)

## Context

Issue #95 integrates the existing bookmark system (database-backed, per-library-entry timestamps) with the in-app audio player. Users need to:

1. Bookmark the current playback position from the player bar.
2. Click bookmarks on the episode page to seek the player.
3. See bookmark indicators on the seek bar.

The key architectural question is how bookmarks flow between the server-side persistence layer (Drizzle + Neon, accessed via server actions requiring `libraryEntryId`) and the client-side audio player context (which knows the episode by its PodcastIndex ID string, not the internal `userLibrary.id`).

### Constraint: The ID Gap

The audio player context stores `currentEpisode.id` as the PodcastIndex episode ID (a string like `"12345"`). The bookmark server actions (`addBookmark`, `getBookmarks`) require `libraryEntryId` (the serial `user_library.id` integer). There is no client-side mapping between these IDs. The episode must also be saved to the library before bookmarks can be created.

## Options Considered

### Option A: New server action that resolves episode ID to library entry ID (chosen)

Add a `getLibraryEntryByEpisodeId(episodePodcastIndexId: string)` server action that returns `{ libraryEntryId: number; episodeId: number } | null`. The bookmark button component calls this action to resolve the mapping, then uses existing `addBookmark`/`getBookmarks` actions. The action also implicitly validates that the episode is in the user's library.

- **Pros:** Minimal new surface area — one new server action, reuses all existing bookmark actions. Clean separation: the player UI doesn't need to know about database internals. The resolution call doubles as a library membership check.
- **Cons:** Extra server round-trip to resolve the ID. But bookmarking is a low-frequency user action (not on the hot path), so the latency is acceptable.

### Option B: Store `libraryEntryId` in `AudioEpisode`

Extend `AudioEpisode` with an optional `libraryEntryId?: number` field, populated when the episode is played from a library context.

- **Pros:** Zero-latency bookmark creation when the ID is available.
- **Cons:** The audio player context becomes aware of library concerns. The ID would be missing when playing from search results or queue (not always from library). Leaks database internals into the client-side episode model. Breaks the clean boundary established in ADR-004.

### Option C: Accept `episodePodcastIndexId` directly in bookmark actions

Modify `addBookmark` to accept an episode PodcastIndex ID instead of a library entry ID, resolving internally.

- **Pros:** Simpler client code.
- **Cons:** Changes the existing server action signature used by `BookmarksList`. Violates the principle that actions operate on user-owned resources by direct ID. Would require modifying all existing callers.

## Decision

**Option A** — new server action for ID resolution, existing bookmark actions unchanged.

## Rationale

- **Preserves existing API contracts.** `addBookmark`, `getBookmarks`, `deleteBookmark` continue to work as-is. `BookmarksList` gains click-to-seek behavior via the audio player API, and `saved-episode-card.tsx` passes `episodeAudioData` to `BookmarksList` to enable seek/play from the library view.
- **Clean boundary.** The audio player context stays focused on playback state. Bookmark awareness lives in a dedicated component that composes the player hooks with server actions.
- **Library-gating is desirable.** The bookmark button naturally shows only when the episode is in the user's library — the resolution action returns null otherwise. This matches the business logic: bookmarks are a library feature.

## Consequences

- A new `getLibraryEntryByEpisodeId` server action is added to `src/app/actions/library.ts`.
- A new `BookmarkButton` component in `src/components/audio-player/bookmark-button.tsx` handles the bookmark creation flow from the player bar.
- Seek bar bookmark indicators are fetched via `getBookmarks` using the resolved library entry ID.
- The `BookmarksList` on the episode page gains click-to-seek behavior that calls `api.seek()` (or `api.playEpisode()` + seek if the episode isn't loaded).
- The `Tooltip` shadcn/ui component must be added (`bunx shadcn@latest add tooltip`) for seek bar bookmark indicator hover states.
