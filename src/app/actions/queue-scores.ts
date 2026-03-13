"use server";

import { auth } from "@clerk/nextjs/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { episodes } from "@/db/schema";

const MAX_IDS = 50;

/**
 * Batch-fetch worth-it scores for a list of PodcastIndex episode IDs.
 * Returns a map of podcastIndexId → score (or null if not yet scored).
 * Returns an empty object when unauthenticated or on error.
 */
export async function getQueueEpisodeScores(
  podcastIndexIds: string[]
): Promise<Record<string, number | null>> {
  try {
    const { userId } = await auth();
    if (!userId) return {};

    const ids = podcastIndexIds
      .filter((id) => typeof id === "string" && id.trim() !== "")
      .slice(0, MAX_IDS);

    if (ids.length === 0) return {};

    const rows = await db
      .select({
        podcastIndexId: episodes.podcastIndexId,
        worthItScore: episodes.worthItScore,
      })
      .from(episodes)
      .where(inArray(episodes.podcastIndexId, ids));

    const result: Record<string, number | null> = {};
    for (const row of rows) {
      result[row.podcastIndexId] =
        row.worthItScore !== null ? parseFloat(row.worthItScore) : null;
    }
    return result;
  } catch {
    return {};
  }
}
