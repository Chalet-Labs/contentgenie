export interface PairwiseResult {
  episodeIdA: number;
  episodeIdB: number;
  winner: "A" | "B" | "tie";
}

export interface RankedEpisode {
  episodeId: number;
  rank: number;
  wins: number;
}

export const MAX_TOPICS_PER_RUN = 50;
export const EPISODES_CAP_HIGH = 10;
export const EPISODES_CAP_LOW = 5;
export const ADAPTIVE_THRESHOLD = 20;

/** Returns all unique pairs from an array. For N items: N*(N-1)/2 pairs. */
export function generateAllPairs<T>(items: T[]): [T, T][] {
  const pairs: [T, T][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      pairs.push([items[i], items[j]]);
    }
  }
  return pairs;
}

/**
 * Aggregates pairwise results into a ranked list.
 * Win = +1, Tie = +0.5 each. Tiebreaker: higher worthItScore ranks first.
 * Returns episodes sorted by rank ascending (rank 1 = best).
 *
 * @param results - pairwise comparison outcomes
 * @param episodeIds - all episode IDs in the comparison (needed to include 0-win episodes)
 * @param scores - map of episodeId → worthItScore as number (callers must parseScore() before constructing)
 */
export function aggregateWinCounts(
  results: PairwiseResult[],
  episodeIds: number[],
  scores: Map<number, number>,
): RankedEpisode[] {
  const wins = new Map<number, number>();
  for (const id of episodeIds) {
    wins.set(id, 0);
  }

  for (const result of results) {
    if (result.winner === "A") {
      wins.set(result.episodeIdA, (wins.get(result.episodeIdA) ?? 0) + 1);
    } else if (result.winner === "B") {
      wins.set(result.episodeIdB, (wins.get(result.episodeIdB) ?? 0) + 1);
    } else {
      wins.set(result.episodeIdA, (wins.get(result.episodeIdA) ?? 0) + 0.5);
      wins.set(result.episodeIdB, (wins.get(result.episodeIdB) ?? 0) + 0.5);
    }
  }

  const sorted = Array.from(wins.entries()).sort(
    ([idA, winsA], [idB, winsB]) => {
      if (winsB !== winsA) return winsB - winsA;
      return (scores.get(idB) ?? 0) - (scores.get(idA) ?? 0);
    },
  );

  return sorted.map(([episodeId, w], index) => ({
    episodeId,
    rank: index + 1,
    wins: w,
  }));
}

// Convenience re-export so callers can import all ranking utilities from one place
export { parseScore } from "@/lib/score-utils";

/**
 * Returns the episode cap based on the number of qualifying topics.
 * <= ADAPTIVE_THRESHOLD topics → EPISODES_CAP_HIGH, otherwise → EPISODES_CAP_LOW.
 */
export function getEpisodeCap(topicCount: number): number {
  return topicCount <= ADAPTIVE_THRESHOLD
    ? EPISODES_CAP_HIGH
    : EPISODES_CAP_LOW;
}

// Convenience re-export so callers can import all ranking utilities from one place
export {
  TOPIC_RANKING_SYSTEM_PROMPT,
  getTopicComparisonPrompt,
} from "@/lib/prompts";
