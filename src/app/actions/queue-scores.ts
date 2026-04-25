"use server";

import { auth } from "@clerk/nextjs/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import { parseScoreOrNull } from "@/lib/score-utils";
import {
  asPodcastIndexEpisodeId,
  type PodcastIndexEpisodeId,
} from "@/types/ids";

const MAX_IDS = 50;

/**
 * Batch-fetch worth-it scores for a list of PodcastIndex episode IDs.
 * Returns a record of podcastIndexId → score (or null if not yet scored).
 * IDs with no matching DB row are omitted from the result.
 * Returns an empty object when unauthenticated or on error.
 */
export async function getQueueEpisodeScores(
  podcastIndexIds: PodcastIndexEpisodeId[],
): Promise<Record<PodcastIndexEpisodeId, number | null>> {
  try {
    const { userId } = await auth();
    if (!userId) return {} as Record<PodcastIndexEpisodeId, number | null>;

    const ids = Array.from(
      new Set(
        podcastIndexIds
          .filter((id) => typeof id === "string")
          // Re-brand after trim: PodcastIndexEpisodeId.trim() returns string.
          .map((id) => asPodcastIndexEpisodeId(id.trim()))
          .filter((id) => id.length > 0),
      ),
    ).slice(0, MAX_IDS);

    if (ids.length === 0)
      return {} as Record<PodcastIndexEpisodeId, number | null>;

    const rows = await db
      .select({
        podcastIndexId: episodes.podcastIndexId,
        worthItScore: episodes.worthItScore,
      })
      .from(episodes)
      .where(inArray(episodes.podcastIndexId, ids));

    const result = Object.create(null) as Record<
      PodcastIndexEpisodeId,
      number | null
    >;
    for (const row of rows) {
      result[row.podcastIndexId] = parseScoreOrNull(row.worthItScore);
    }
    return result;
  } catch (err) {
    console.error("getQueueEpisodeScores failed:", err);
    return {};
  }
}
