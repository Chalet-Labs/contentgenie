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
