/**
 * Pure utility functions for computing topic overlap between a user's
 * consumption history and a candidate episode's topics.
 *
 * No DB calls, no auth — all inputs are passed in.
 */

/** Minimum total consumed episodes before any overlap indicators are shown. */
export const MIN_CONSUMED_FOR_INDICATORS = 3;

/** Overlap count threshold for the "You've heard N similar episodes" label. */
export const HIGH_OVERLAP_THRESHOLD = 3;

/** Minimum total consumed episodes before the "New topic for you" label is shown. */
export const MIN_CONSUMED_FOR_NEW_TOPIC = 5;

/** Discriminator for the kind of overlap label, used to determine UI styling. */
export type OverlapLabelKind = "high-overlap" | "top-pick" | "new-topic";

/**
 * Result of a topic overlap computation.
 *
 * `overlapCount` is the max consumed-episode count on the **single** most-overlapping
 * topic, NOT the count of distinct overlapping topics. For example, if the user has
 * consumed 3 "AI Ethics" episodes and 2 "Technology" episodes, and the candidate
 * episode covers both, `overlapCount` is 3 (from "AI Ethics").
 */
export interface TopicOverlapResult {
  /** Max consumed-episode count on the single most-overlapping topic (0 if none). */
  overlapCount: number;
  /** The topic with the highest consumed count that matches this episode (null if none). */
  topOverlapTopic: string | null;
  /**
   * True when the episode has topics, none appear in the user's history,
   * AND totalConsumed >= MIN_CONSUMED_FOR_NEW_TOPIC (enough history to be
   * confident the topic is genuinely new).
   */
  isNewTopic: boolean;
  /** Display label for the UI, or null when no indicator should be shown. */
  label: string | null;
  /** Label kind for UI styling — avoids string-parsing the label text. */
  labelKind: OverlapLabelKind | null;
}

/** Sentinel value for "no overlap data available." */
export const EMPTY_OVERLAP_RESULT: TopicOverlapResult = Object.freeze({
  overlapCount: 0,
  topOverlapTopic: null,
  isNewTopic: false,
  label: null,
  labelKind: null,
});

/** A row from the `episode_topics` table (only the fields we need). */
export interface EpisodeTopicRow {
  topic: string;
  relevance: string;
}

/** A row from the batch topic-count query. */
export interface TopicCountRow {
  topic: string;
  count: number;
}

/**
 * Aggregate raw topic-count query rows into a profile map.
 * Maps topic → number of distinct consumed episodes tagged with that topic.
 */
export function buildUserTopicProfile(
  rows: TopicCountRow[],
): Map<string, number> {
  const profile = new Map<string, number>();
  for (const row of rows) {
    profile.set(row.topic, row.count);
  }
  return profile;
}

/**
 * Compute topic overlap between a user's consumption history and a candidate episode.
 *
 * Label priority (first match wins):
 * 0. episodeTopics is empty → null (no topics to compare)
 * 1. totalConsumed < MIN_CONSUMED_FOR_INDICATORS → null (global gate — no indicators shown)
 * 2. overlapCount >= HIGH_OVERLAP_THRESHOLD → "You've heard N similar episodes" (high-overlap)
 * 3. topicRank === 1 && overlapCount === 0 → "Top pick for [first topic]" (top-pick)
 * 4. overlapCount === 0 && totalConsumed >= MIN_CONSUMED_FOR_NEW_TOPIC → "New topic for you" (new-topic)
 * 5. otherwise → null
 *
 * @param userProfile - Map of topic → consumed-episode count (from buildUserTopicProfile)
 * @param episodeTopics - Topics tagged on the candidate episode
 * @param totalConsumed - Total number of episodes the user has consumed (listen_history UNION user_library)
 * @param topicRank - The episode's best topic rank (1 = trending #1), or null/undefined if unranked
 */
export function computeTopicOverlap(
  userProfile: Map<string, number>,
  episodeTopics: EpisodeTopicRow[],
  totalConsumed: number,
  topicRank?: number | null,
): TopicOverlapResult {
  // Global gate: fewer than MIN_CONSUMED_FOR_INDICATORS consumed episodes → no indicators at all
  if (totalConsumed < MIN_CONSUMED_FOR_INDICATORS) {
    return EMPTY_OVERLAP_RESULT;
  }

  // No topics on this episode → no indicator
  if (episodeTopics.length === 0) {
    return EMPTY_OVERLAP_RESULT;
  }

  // Find the single topic with the highest consumed count
  let overlapCount = 0;
  let topOverlapTopic: string | null = null;
  for (const { topic } of episodeTopics) {
    const count = userProfile.get(topic) ?? 0;
    if (count > overlapCount) {
      overlapCount = count;
      topOverlapTopic = topic;
    }
  }

  // Rule 2: high overlap
  if (overlapCount >= HIGH_OVERLAP_THRESHOLD) {
    return {
      overlapCount,
      topOverlapTopic,
      isNewTopic: false,
      label: `You've heard ${overlapCount} similar episodes`,
      labelKind: "high-overlap",
    };
  }

  // Rule 3: top pick (only when no overlap)
  if (topicRank === 1 && overlapCount === 0) {
    // Use the first topic as the label topic (most relevant by convention)
    const labelTopic = episodeTopics[0].topic;
    return {
      overlapCount: 0,
      topOverlapTopic: null,
      isNewTopic: false,
      label: `Top pick for ${labelTopic}`,
      labelKind: "top-pick",
    };
  }

  // Rule 4: new topic (no overlap, enough history to be confident)
  if (overlapCount === 0 && totalConsumed >= MIN_CONSUMED_FOR_NEW_TOPIC) {
    return {
      overlapCount: 0,
      topOverlapTopic: null,
      isNewTopic: true,
      label: "New topic for you",
      labelKind: "new-topic",
    };
  }

  // Rule 5: no label
  return {
    overlapCount,
    topOverlapTopic,
    isNewTopic: false,
    label: null,
    labelKind: null,
  };
}

// ---------------------------------------------------------------------------
// Canonical-topic overlap (ADR-042 / ADR-034 analogue)
// ---------------------------------------------------------------------------

/** A canonical topic linked to a target episode (pre-fetched server-side). */
export interface CanonicalOverlapTargetRow {
  canonicalTopicId: number;
  topicLabel: string;
  coverageScore: number;
}

/**
 * Overlap indicator for a single episode at the canonical-topic level.
 *
 * - `new`    — episode has canonicals but none appear in the user's history.
 * - `repeat` — at least one canonical was already heard; `count` = how many
 *              other episodes the user consumed that share the top canonical.
 */
export type CanonicalOverlapResult =
  | { kind: "new"; topicLabel: string; topicId: number }
  | { kind: "repeat"; count: number; topicLabel: string; topicId: number };

/**
 * Pick the overlap indicator for a single target episode given its active
 * canonical topics and per-canonical user-overlap counts (already excluding
 * the target itself — see `getCanonicalTopicOverlaps` for the subtraction).
 *
 * Returns `null` when `targetCanonicals` is empty; the caller falls back to
 * ADR-034 category overlap per ADR-042 §"Feature 1 — Dedup awareness".
 *
 * Tie-breakers (applied in order):
 *  1. Highest overlap count (→ `repeat`) or any positive count (→ `repeat`).
 *  2. Highest `coverageScore` among candidates at the max count.
 *  3. Lowest `canonicalTopicId` when coverageScore is also tied.
 *  (Same convention as `canonical-topics.ts` row_number ORDER BY.)
 *
 * No MIN_CONSUMED gate (intentional divergence from ADR-034). Canonical
 * topics are entity-resolved — "I've heard 1 other Opus 4.7 episode" is a
 * meaningful signal even with a small history. The noise that justifies
 * ADR-034's MIN_CONSUMED gate (broad categories) does not apply here.
 * See plan §"Decisions deviating from issue spec" #5 and ADR-042.
 */
export function computeCanonicalTopicOverlap(
  targetCanonicals: CanonicalOverlapTargetRow[],
  userOverlapCounts: ReadonlyMap<number, number>,
): CanonicalOverlapResult | null {
  if (targetCanonicals.length === 0) return null;

  // Find the max per-canonical overlap count across all of this episode's canonicals.
  let maxCount = 0;
  for (const { canonicalTopicId } of targetCanonicals) {
    const count = userOverlapCounts.get(canonicalTopicId) ?? 0;
    if (count > maxCount) maxCount = count;
  }

  if (maxCount > 0) {
    // Repeat path: pick the canonical at maxCount, tie-breaking by coverageScore desc,
    // then canonicalTopicId asc.
    let best = targetCanonicals[0];
    let bestCount = userOverlapCounts.get(best.canonicalTopicId) ?? 0;
    for (let i = 1; i < targetCanonicals.length; i++) {
      const row = targetCanonicals[i];
      const count = userOverlapCounts.get(row.canonicalTopicId) ?? 0;
      if (count < maxCount) continue;
      if (bestCount < maxCount) {
        // best hasn't yet been set to a max-count row
        best = row;
        bestCount = count;
        continue;
      }
      if (
        row.coverageScore > best.coverageScore ||
        (row.coverageScore === best.coverageScore &&
          row.canonicalTopicId < best.canonicalTopicId)
      ) {
        best = row;
        bestCount = count;
      }
    }
    return {
      kind: "repeat",
      count: maxCount,
      topicLabel: best.topicLabel,
      topicId: best.canonicalTopicId,
    };
  }

  // New path: all counts are 0; pick canonical with highest coverageScore,
  // tie-breaking by lowest canonicalTopicId.
  let best = targetCanonicals[0];
  for (let i = 1; i < targetCanonicals.length; i++) {
    const row = targetCanonicals[i];
    if (
      row.coverageScore > best.coverageScore ||
      (row.coverageScore === best.coverageScore &&
        row.canonicalTopicId < best.canonicalTopicId)
    ) {
      best = row;
    }
  }
  return {
    kind: "new",
    topicLabel: best.topicLabel,
    topicId: best.canonicalTopicId,
  };
}
