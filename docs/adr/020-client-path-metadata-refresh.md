# ADR-020: Client-Path Metadata Refresh Policy

**Status:** Accepted
**Date:** 2026-03-10
**Updated:** 2026-03-11

## Context

`upsertPodcast()` previously had a binary `updateOnConflict?: boolean`:

- `true` (default): full metadata update, used by Trigger.dev background tasks
- `false`: no-op touch (self-assigns `podcastIndexId` for RETURNING), used by client-facing paths

This meant client paths never refreshed podcast metadata (title, artwork, description, publisher, episode count). Metadata stayed stale until a background job ran. The original rationale was security: prevent client-provided data from overwriting existing podcast records.

An initial revision introduced a `"safe"` mode that updated whitelisted display fields from client paths. During review, we concluded that client paths have no legitimate reason to update any metadata — all metadata is owned by background jobs. Allowing client-relayed data to update shared records is an unnecessary attack surface for marginal freshness.

## Decision

Replace the boolean with a `"full" | "safe"` string union:

- `"full"`: updates all provided fields (trusted background tasks)
- `"safe"`: **no metadata updates on conflict** — only bumps `updatedAt` so RETURNING yields the row ID. Protected fields (`rssFeedUrl`, `source`) are also stripped from INSERT values so client paths cannot seed them for new records. Use for all client-facing server actions and API routes.

The same principle applies to episode upserts in client-facing paths: on conflict, only `updatedAt` is bumped. Fields like `audioUrl` are never overwritten by client data.

### Trust Model

Client paths are untrusted for metadata. Background jobs (Trigger.dev) are the sole authoritative source for all podcast and episode metadata. Client paths only create records (INSERT) and establish user relationships (subscriptions, library entries).

Zod validation is applied at all client entry points (server actions and API routes) for input sanitization, but validated data is still not used to update existing records.

### Zod Validation

Both server action call sites (`src/app/actions/library.ts`, `src/app/actions/subscriptions.ts`) now validate input via Zod schemas matching the API route schemas.

## Consequences

- Client-initiated actions (subscribe, save episode) create new records but never update existing metadata
- All metadata updates flow exclusively through Trigger.dev background jobs
- Protected fields (`rssFeedUrl`, `source`) are stripped from client INSERT values
- Episode `audioUrl` is never overwritten from client paths
- Metadata staleness is addressed by background job scheduling, not client-side refreshes
- A future "refresh" button could trigger a background job to re-fetch metadata on demand
