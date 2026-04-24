import { inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { episodeTopics } from "@/db/schema";
import { TOPICS_PER_EPISODE_LIMIT } from "@/lib/episodes/topic-display";

export { TOPICS_PER_EPISODE_LIMIT };

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
    const episodeIds = dbEpisodes.map((e) => e.id);
    const idToPodcastIndexId = new Map(
      dbEpisodes.map((e) => [e.id, e.podcastIndexId] as const),
    );
    const sub = db
      .select({
        episodeId: episodeTopics.episodeId,
        topic: episodeTopics.topic,
        rn: sql<number>`
          row_number() over (
            partition by ${episodeTopics.episodeId}
            order by ${episodeTopics.topicRank} nulls last, ${episodeTopics.topic}
          )
        `.as("rn"),
      })
      .from(episodeTopics)
      .where(inArray(episodeTopics.episodeId, episodeIds))
      .as("sub");

    const rows = await db
      .select({
        episodeId: sub.episodeId,
        topic: sub.topic,
      })
      .from(sub)
      .where(lte(sub.rn, TOPICS_PER_EPISODE_LIMIT))
      .orderBy(sub.episodeId, sub.rn);

    const out: Record<string, string[]> = {};
    for (const row of rows) {
      const pi = idToPodcastIndexId.get(row.episodeId);
      if (!pi) continue;
      (out[pi] ??= []).push(row.topic);
    }
    return out;
  } catch (err) {
    console.error("[podcast] getTopicsByPodcastIndexId failed", err);
    return {};
  }
}
