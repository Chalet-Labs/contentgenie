import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { episodeTopics } from "@/db/schema";

// Max topics per episode kept in the client — the card primitive renders at
// most 3 chips, so fetching ranks 1..4 is enough signal (the extra one is
// insurance against ties).
export const TOPICS_PER_EPISODE_LIMIT = 4;

/**
 * Batch-fetch top topics for a set of DB episodes keyed by their PodcastIndex id.
 * Topics are public metadata attached to summarized episodes — no per-user gating.
 * Returns `{}` on DB failure so a transient outage doesn't nuke the whole page
 * for a decorative chip row.
 */
export async function getTopicsByPodcastIndexId(
  dbEpisodes: { id: number; podcastIndexId: string }[],
): Promise<Record<string, string[]>> {
  if (dbEpisodes.length === 0) return {};
  try {
    const idToPodcastIndexId = new Map(
      dbEpisodes.map((e) => [e.id, e.podcastIndexId]),
    );
    const rows = await db
      .select({
        episodeId: episodeTopics.episodeId,
        topic: episodeTopics.topic,
        topicRank: episodeTopics.topicRank,
      })
      .from(episodeTopics)
      .where(
        inArray(
          episodeTopics.episodeId,
          Array.from(idToPodcastIndexId.keys()),
        ),
      );
    const grouped: Record<number, { topic: string; rank: number | null }[]> = {};
    for (const row of rows) {
      const list = grouped[row.episodeId] ?? (grouped[row.episodeId] = []);
      list.push({ topic: row.topic, rank: row.topicRank });
    }
    const out: Record<string, string[]> = {};
    for (const [dbId, list] of Object.entries(grouped)) {
      const pi = idToPodcastIndexId.get(Number(dbId));
      if (!pi) continue;
      out[pi] = list
        .sort((a, b) => {
          if (a.rank === null && b.rank === null) return 0;
          if (a.rank === null) return 1;
          if (b.rank === null) return -1;
          return a.rank - b.rank;
        })
        .slice(0, TOPICS_PER_EPISODE_LIMIT)
        .map((x) => x.topic);
    }
    return out;
  } catch (err) {
    console.error("[podcast] getTopicsByPodcastIndexId failed", err);
    return {};
  }
}
