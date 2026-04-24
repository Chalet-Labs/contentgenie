# ADR-034: Personal Topic Overlap Indicators (Display-Only)

**Status:** Proposed
**Date:** 2026-04-14
**Issue:** [#262](https://github.com/Chalet-Labs/contentgenie/issues/262)

## Context

The worth-it score (ADR-032) is the same for every user. A 7.5-rated episode on "Leadership" shows 7.5 whether the user has listened to zero or five leadership episodes. Per-episode topic tags (ADR-031) and cross-episode topic rankings (ADR-033) provide the data needed to answer "Is this worth MY time given what I've already consumed?" This ADR adds a presentation-layer overlay using the user's listen history and saved episodes to provide contextual topic overlap indicators.

## Decision

### Display-only overlay, no score mutation

The stored `worth_it_score` column is never modified. Topic overlap is computed at query time and attached as additional metadata to the returned DTOs. This is a pure presentation concern.

### User topic profile construction

A "user topic profile" is a `Map<string, number>` mapping normalized topic strings to the count of distinct consumed episodes tagged with that topic. "Consumed" means the episode appears in either `listen_history` or `user_library` (union, deduplicated by episode ID).

The profile is built via two batch queries:

1. Get consumed episode IDs: `SELECT episode_id FROM listen_history WHERE user_id = ? UNION SELECT episode_id FROM user_library WHERE user_id = ?`
2. Get topic tags for those episodes: `SELECT topic, COUNT(DISTINCT episode_id) FROM episode_topics WHERE episode_id IN (?) GROUP BY topic`

This avoids N+1 by doing exactly 2 queries regardless of how many episodes the user has consumed.

### Overlap computation

A pure function in `src/lib/topic-overlap.ts` takes:

- User topic profile: `Map<string, number>`
- Episode topics: `Array<{ topic: string; relevance: string }>`
- Total consumed episode count: `number`

And returns:

```typescript
interface TopicOverlapResult {
  /**
   * Max consumed-episode count on the single most-overlapping topic.
   * NOT the count of distinct overlapping topics.
   * e.g., if user consumed 5 "AI" episodes and 2 "Leadership" episodes,
   * and the current episode is tagged ["AI", "Leadership"],
   * overlapCount = 5 (the max), topOverlapTopic = "AI".
   */
  overlapCount: number;
  topOverlapTopic: string | null; // the topic with highest overlap
  isNewTopic: boolean; // true if ALL episode topics are new to the user
  label: string | null; // pre-computed display label, null if no indicator
  labelKind: "high-overlap" | "top-pick" | "new-topic" | null; // discriminator for UI styling
}
```

Label rules (evaluated in priority order, first match wins):

1. **Global gate**: `totalConsumed < 3` → `null` — applies to ALL labels including "Top pick." A user with 1-2 consumed episodes has too little history for any personalized indicator.
2. `overlapCount >= 3`: `"You've heard N similar episodes"` (amber)
3. `overlapCount === 0 && topicRank === 1`: `"Top pick for [topic]"` (green, highest priority among positive labels)
4. `overlapCount === 0 && totalConsumed >= 5`: `"New topic for you"` (green)
5. Otherwise: `null` (no indicator shown)

### Recommendation sort adjustment

In `getRecommendedEpisodes()`, after computing overlap for each candidate:

1. Partition into two groups: `overlapCount >= 3` (deprioritized) and the rest
2. Within each group, preserve the existing sort (worthItScore DESC, publishDate DESC)
3. Concatenate: non-deprioritized first, then deprioritized

This is a stable partition, not a re-sort. Episodes with heavy topic overlap float to the bottom but remain visible. The threshold of 3 matches the "diminishing returns" semantics — hearing 1-2 episodes on a topic is not saturation.

### DTO extension

`RecommendedEpisodeDTO` gains optional overlap fields:

```typescript
overlapCount?: number;
overlapTopic?: string | null;
overlapLabel?: string | null;
overlapLabelKind?: "high-overlap" | "top-pick" | "new-topic" | null;
```

These are optional so existing consumers (tests, other call sites) don't break. The `RecentEpisode` type from the PodcastIndex feed does not get overlap — those episodes come from an external API and may not have topic tags in our DB. The issue focuses on recommendations and the episode detail page.

### UI indicators

Three display surfaces:

1. **`episode-recommendations.tsx`**: Compact label below the WorthItBadge — colored text with no icon, matching existing metadata density
2. **`summary-display.tsx`**: Overlap label rendered inside the Worth-It Score card, below the score progress bar. Uses a colored `<p>` element matching existing metadata density.
3. **`worth-it-badge.tsx`**: No change — the badge shows the score only. Adding overlap to the badge would conflate two different signals.

### Episode detail page overlap

The episode detail page (`/episode/[id]`) loads data via the `/api/episodes/[id]` route, which returns episode + podcast + summary data. Overlap is NOT computed here — it would require an authenticated server action call from a client component. Instead, a new server action `getEpisodeTopicOverlap(podcastIndexEpisodeId: string)` is added to `dashboard.ts`. The episode page calls this action inside a `useEffect` (after episode data loads successfully), stores the result in component state, and passes it to `SummaryDisplay` when available. The action must not be called at module level or in the render path — it is an async side effect triggered by the episode data loading.

## Consequences

- **No schema migration.** No new columns or tables.
- **Three additional queries per dashboard load** (consumed-episodes UNION, topic-profile GROUP BY, candidate-episode topics IN). The consumed-episodes and topic-profile queries add ~10-30ms; the candidate-topics query is bounded by the result limit. All are indexed (`listen_history_user_id_idx`, `user_library_user_id_idx`, `episode_topics_topic_idx`).
- **Graceful degradation.** Episodes without topic tags (pre-#259) produce empty topic lists, so `overlapCount = 0` and no indicator is shown. Users with <3 consumed episodes see no indicators.
- **No impact on stored data.** `worth_it_score`, `episode_topics`, `listen_history`, and `user_library` are all read-only from this feature's perspective.

## Related ADRs

- ADR-021: Listen history tracking — source of consumption data
- ADR-031: Episode topics junction table — source of topic tags
- ADR-032: Boolean signal scoring — worth-it score that this feature overlays
- ADR-033: Cross-episode topic ranking — `topicRank` used for "Top pick" labels
