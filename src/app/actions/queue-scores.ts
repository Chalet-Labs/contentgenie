"use server";

import { auth } from "@clerk/nextjs/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { episodes } from "@/db/schema";

const MAX_IDS = 50;

/**
 * Batch-fetch worth-it scores for a list of PodcastIndex episode IDs.
 * Returns a record of podcastIndexId → score (or null if not yet scored).
 * IDs with no matching DB row are omitted from the result.
 * Returns an empty object when unauthenticated or on error.
 */
export async function getQueueEpisodeScores(
  podcastIndexIds: string[]
): Promise<Record<string, number | null>> {
  try {
    const { userId } = await auth();
    if (!userId) return {};

    const ids = Array.from(new Set(
      podcastIndexIds
        .filter((id) => typeof id === "string")
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    )).slice(0, MAX_IDS);

    if (ids.length === 0) return {};

    const rows = await db
      .select({
        podcastIndexId: episodes.podcastIndexId,
        worthItScore: episodes.worthItScore,
      })
      .from(episodes)
      .where(inArray(episodes.podcastIndexId, ids));

    const result = Object.create(null) as Record<string, number | null>;
    for (const row of rows) {
      result[row.podcastIndexId] =
        row.worthItScore !== null ? parseFloat(row.worthItScore) : null;
    }
    return result;
  } catch (err) {
    console.error("getQueueEpisodeScores failed:", err);
    return {};
  }
}
