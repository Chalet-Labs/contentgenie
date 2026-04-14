/**
 * Pure utility functions for computing topic overlap between a user's
 * consumption history and a candidate episode's topics.
 *
 * No DB calls, no auth — all inputs are passed in.
 */

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
  /** True when the episode has topics but none appear in the user's history. */
  isNewTopic: boolean;
  /** Display label for the UI, or null when no indicator should be shown. */
  label: string | null;
}

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
export function buildUserTopicProfile(rows: TopicCountRow[]): Map<string, number> {
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
 * 1. totalConsumed < 3 → null (global gate — no indicators shown)
 * 2. overlapCount >= 3 → "You've heard N similar episodes" (amber)
 * 3. topicRank === 1 && overlapCount === 0 → "Top pick for [topic]" (green)
 * 4. overlapCount === 0 && totalConsumed >= 5 → "New topic for you" (green)
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
  topicRank?: number | null
): TopicOverlapResult {
  // Global gate: fewer than 3 consumed episodes → no indicators at all
  if (totalConsumed < 3) {
    return { overlapCount: 0, topOverlapTopic: null, isNewTopic: false, label: null };
  }

  // No topics on this episode → no indicator
  if (episodeTopics.length === 0) {
    return { overlapCount: 0, topOverlapTopic: null, isNewTopic: false, label: null };
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

  // Rule 1 (global gate) already handled above.

  // Rule 2: high overlap
  if (overlapCount >= 3) {
    return {
      overlapCount,
      topOverlapTopic,
      isNewTopic: false,
      label: `You've heard ${overlapCount} similar episodes`,
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
    };
  }

  // Rule 4: new topic (no overlap, enough history to be confident)
  if (overlapCount === 0 && totalConsumed >= 5) {
    return {
      overlapCount: 0,
      topOverlapTopic: null,
      isNewTopic: true,
      label: "New topic for you",
    };
  }

  // Rule 5: no label
  return { overlapCount, topOverlapTopic, isNewTopic: false, label: null };
}
