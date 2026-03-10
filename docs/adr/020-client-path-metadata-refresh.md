# ADR-020: Client-Path Metadata Refresh Policy

**Status:** Accepted
**Date:** 2026-03-10

## Context

`upsertPodcast()` previously had a binary `updateOnConflict?: boolean`:
- `true` (default): full metadata update, used by Trigger.dev background tasks
- `false`: no-op touch (self-assigns `podcastIndexId` for RETURNING), used by client-facing paths

This meant client paths never refreshed podcast metadata (title, artwork, description, publisher, episode count). Metadata stayed stale until a background job ran. The original rationale was security: prevent client-provided data from overwriting existing podcast records.

## Decision

Replace the boolean with a `"full" | "safe"` string union:
- `"full"`: updates all provided fields (trusted background tasks)
- `"safe"`: updates only whitelisted display fields (client-facing paths)

### Field Classification

**Safe (updated from client paths):** `title`, `imageUrl`, `description`, `publisher`, `categories`, `totalEpisodes`, `latestEpisodeDate`

**Protected (never updated from client paths):**
- `source` — trust classification, owned by background jobs
- `lastPolledAt` — owned by Trigger.dev polling scheduler
- `rssFeedUrl` — structural, affects RSS polling

### Trust Model

Safe fields are user-controlled display data. The server does not re-verify values against PodcastIndex. Risk is accepted because:

1. All rendering is escaped (no raw HTML injection)
2. API routes enforce format/length bounds via Zod schemas
3. Server actions now also validate via Zod (gap closed in this PR)
4. Metadata is shared (not user-specific), so content injection affects display only

### Zod Validation Gap

The two server action call sites (`src/app/actions/library.ts`, `src/app/actions/subscriptions.ts`) previously lacked Zod validation for podcast fields. This PR adds validation matching the API route schemas, closing the gap before enabling safe-field updates.

## Consequences

- Client-initiated actions (subscribe, save episode) now refresh display metadata, reducing staleness
- Protected fields remain immutable from client paths
- The old boolean `false` mode (no-op touch) is removed as dead code
- Background job metadata refresh remains the authoritative source for all fields
- If new fields are added to the podcasts table, they must be explicitly classified as safe or protected
