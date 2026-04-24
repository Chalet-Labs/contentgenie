# ADR 023: Cross-User Episode Recommendations

## Status

Proposed

## Context

The dashboard currently shows podcast-level recommendations via `getRecommendedPodcasts()`, which fetches trending podcasts from the PodcastIndex API and filters out already-subscribed ones in JavaScript. This approach has several limitations:

1. **Podcast-level is too coarse.** Users want episode-specific recommendations, not just podcast suggestions. A great podcast can have mediocre episodes and vice versa.
2. **No quality signal.** The current recommendations use PodcastIndex trending rank, not the Worth It scores the app already computes. High-scoring episodes from unsubscribed podcasts are invisible.
3. **No exclusion of already-consumed content.** There is no filtering against the user's library or listen history.
4. **External API dependency.** Every dashboard load calls PodcastIndex trending, adding latency and a point of failure.

Issue #189 requires replacing podcast-level recommendations with episode-level ones that leverage the existing `worthItScore` data in the `episodes` table.

## Decision

Replace `getRecommendedPodcasts()` with `getRecommendedEpisodes()` — a server action that queries the local database for high-scoring episodes from podcasts the user is NOT subscribed to, excluding episodes already in the user's library or listen history.

### Query strategy

Use the Drizzle SQL builder (`db.select().from()`) with `notInArray` subqueries for exclusion, rather than the relational query API. This is the first use of exclusion subqueries in the codebase, but is the correct approach because:

- The relational API (`db.query.*.findMany()`) does not support `NOT IN` subqueries in its `where` clause.
- JS-side filtering (fetch all, filter in memory) is wasteful and won't scale as the episodes table grows.
- Raw SQL via `sql\`\`` would work but loses type safety.

The query:

1. Selects the same 8 fields as `EPISODE_LIST_COLUMNS` (id, podcastIndexId, title, description, audioUrl, duration, publishDate, worthItScore) + podcast title/image from joined `podcasts` table. Note: `EPISODE_LIST_COLUMNS` is a relational query allowlist (boolean flags) that cannot be spread into the SQL builder's `db.select({})` which requires column references. The manual column list achieves the same performance goal — excluding heavy columns like transcription, summary, keyTakeaways, worthItDimensions, worthItReason.
2. Filters: `worthItScore IS NOT NULL` and `worthItScore >= threshold` (default 6.0)
3. Excludes: episodes whose `podcastId` is in the user's subscriptions (via `notInArray` subquery on `userSubscriptions`). When the subquery returns zero rows (new user), SQL evaluates `NOT IN (empty set)` as `TRUE` — no exclusions, which is correct.
4. Excludes: episodes whose `id` is in the user's library (via `notInArray` subquery on `userLibrary`)
5. Excludes: episodes whose `id` is in the user's listen history (via `notInArray` subquery on `listenHistory`)
6. Orders by `worthItScore DESC`, then `publishDate DESC` (quality first, recency as tiebreaker)
7. Limits to `limit` (default 10 per issue spec; dashboard passes 6 for the grid display)

### Component strategy

Replace the existing `Recommendations` component (which renders podcast cards) with a new `EpisodeRecommendations` component that renders episode cards with:

- Podcast artwork (from joined podcast data)
- Episode title, podcast name, description snippet
- Color-coded `WorthItBadge` using existing `score-utils.ts`
- Duration, publish date metadata
- Link to `/episode/{podcastIndexId}`

The component will be a server component wrapper + client presentation component, matching the existing dashboard pattern (see `RecommendationsSection` in `page.tsx`).

### DTO design

Define a `RecommendedEpisodeDTO` type that extends `EpisodeListDTO` with podcast metadata (`podcastTitle`, `podcastImageUrl`). This avoids fetching heavy columns (transcription, summary, etc.) while providing everything the card needs.

## Consequences

### Positive

- Users see actionable episode-level recommendations ranked by quality
- No external API dependency — queries local database only
- Excludes already-consumed content (subscribed podcasts, saved episodes, listened episodes)
- Reuses existing `WorthItBadge` and `score-utils.ts` — consistent score display
- Single SQL query with subqueries — efficient, no N+1

### Negative

- Recommendations are limited to episodes that have been summarized (have `worthItScore`). New podcasts without summarized episodes won't appear. This is acceptable because the Worth It score IS the quality signal.
- Cold start: users with no subscriptions, library, or listen history get generic "top-scored" episodes. This is fine as a starting point.
- The `getRecommendedPodcasts()` function and `Recommendations` component become dead code and should be removed.

### Risks

- If the `episodes` table has very few scored episodes, recommendations may be sparse. Mitigation: the empty state already handles this gracefully.
- No index on `worthItScore` — the query scans with filters. For the current data volume this is fine; add an index if the table exceeds ~100k rows.
