import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { episodeTopics } from "@/db/schema";

export const TOPICS_PER_EPISODE_LIMIT = 4;

/**
 * Batch-fetch top topics per episode, keyed by PodcastIndex id.
 *
 * Returns `{}` on DB failure so a transient outage doesn't nuke the whole
 * page for a decorative chip row.
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
      })
      .from(episodeTopics)
      .where(
        inArray(
          episodeTopics.episodeId,
          Array.from(idToPodcastIndexId.keys()),
        ),
      )
      .orderBy(sql`${episodeTopics.topicRank} ASC NULLS LAST`);
    const out: Record<string, string[]> = {};
    for (const row of rows) {
      const pi = idToPodcastIndexId.get(row.episodeId);
      if (!pi) continue;
      const existing = out[pi] ?? [];
      if (existing.length < TOPICS_PER_EPISODE_LIMIT) {
        existing.push(row.topic);
        out[pi] = existing;
      }
    }
    return out;
  } catch (err) {
    console.error("[podcast] getTopicsByPodcastIndexId failed", err);
    return {};
  }
}
