# ADR-016: Client-Side Chapter Markers via JSON Chapters Fetch

**Status:** Proposed
**Date:** 2026-03-04
**Issue:** [#97](https://github.com/Chalet-Labs/contentgenie/issues/97)

## Context

Issue #97 adds chapter marker display and navigation to the audio player. Podcasts using the Podcasting 2.0 `<podcast:chapters>` tag include a `chaptersUrl` in their PodcastIndex episode metadata pointing to a JSON Chapters file. The PodcastIndex API already returns `chaptersUrl` on the `PodcastIndexEpisode` type (`src/lib/podcastindex.ts:95`). The question is where and how to fetch, store, and surface chapter data.

Key constraints:

1. Chapter data is only needed when an episode is actively playing.
2. Fetching must be non-blocking (don't delay playback start).
3. Chapters are optional — many episodes have no chapters.
4. The `chaptersUrl` points to an external URL (the podcast host), not PodcastIndex itself.
5. The chapter JSON file follows the [JSON Chapters Format](https://github.com/Podcastindex-org/podcast-namespace/blob/main/chapters/jsonChapters.md) spec.

## Options Considered

### Option A: Client-side fetch in AudioPlayerContext (chosen)

When `playEpisode` is called, if the episode has a `chaptersUrl`, fire a non-blocking `fetch` from the client to a thin API proxy (`/api/chapters?url=<chaptersUrl>`). The proxy validates the URL via `isSafeUrl` (SSRF protection from `src/lib/security.ts`), fetches the JSON, validates the schema, and returns the chapters array. Chapter state is stored in the existing `AudioPlayerStateContext` as `chapters: Chapter[] | null`.

- **Pros:** Zero latency on playback start (chapters load in background). Chapters are naturally scoped to the current episode — when episode changes, chapters reset. Builds on the existing context architecture (ADR-004). No database schema changes. Proxy reuses existing SSRF protections.
- **Cons:** Requires a new API route for proxying. Client must include `chaptersUrl` in `AudioEpisode`. Chapters are not cached across sessions (acceptable — they're lightweight and re-fetched on play).

### Option B: Fetch chapters in the episode API route

Extend `GET /api/episodes/[id]` to also fetch and return the chapters JSON alongside episode data.

- **Pros:** Single network request from client. Server-side caching possible.
- **Cons:** Adds latency to the episode detail page load for data that's only useful during playback. Chapter data can change (live podcasts update chapters), so aggressive caching is risky. Couples chapter fetching to page view, not playback. Over-fetches for users who view but don't play.

### Option C: Fetch directly from client (no proxy)

Have the browser `fetch` the `chaptersUrl` directly without going through our API.

- **Pros:** Simplest implementation. No new API route.
- **Cons:** CORS — most podcast hosts don't set `Access-Control-Allow-Origin` headers, so browser fetch will fail. No SSRF protection. No validation or sanitization of external JSON before it reaches the client. Not viable.

## Decision

**Option A** — client-side chapter fetch via API proxy, state integrated into `AudioPlayerContext`.

## Rationale

- **Non-blocking by design.** Chapters are fetched after `playEpisode` triggers playback. The player works identically with or without chapters — they appear asynchronously.
- **CORS solved.** The server-side proxy bypasses CORS restrictions on external chapter URLs.
- **Security maintained.** The proxy validates the URL with `isSafeUrl` before fetching, preventing SSRF. The response is validated against the JSON Chapters schema before returning to the client.
- **Minimal state growth.** Adding `chapters: Chapter[] | null` and `chaptersLoading: boolean` to `AudioPlayerState` is consistent with the bounded-complexity rationale in ADR-004. Two new reducer actions (`SET_CHAPTERS`, `CLEAR_CHAPTERS`) match the existing pattern.
- **AudioEpisode extension is backwards-compatible.** Adding an optional `chaptersUrl?: string` field to `AudioEpisode` doesn't break existing consumers.

## Consequences

- `AudioEpisode` gains an optional `chaptersUrl?: string` field.
- `AudioPlayerState` gains `chapters: Chapter[] | null` and `chaptersLoading: boolean`.
- A new `Chapter` interface is defined (matching JSON Chapters spec): `{ startTime: number; title: string; img?: string; url?: string }`.
- A new API route `GET /api/chapters` proxies and validates external chapter JSON.
- The `playEpisode` action in `AudioPlayerProvider` triggers a non-blocking chapter fetch when `chaptersUrl` is present.
- Components consuming chapters (chapter list, seek bar markers) subscribe to `AudioPlayerStateContext` — chapters change at low frequency (only on episode switch), so they don't cause high-frequency re-renders.
- All callers of `playEpisode` that have access to `chaptersUrl` should include it in the `AudioEpisode` object (episode detail page, queue items if enriched).
