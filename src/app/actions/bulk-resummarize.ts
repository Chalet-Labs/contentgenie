"use server";

import { auth } from "@clerk/nextjs/server";
import { and, isNotNull, lte, gte, eq, count } from "drizzle-orm";
import { db } from "@/db";
import { episodes } from "@/db/schema";

export async function getResummarizeEpisodeCount(filters: {
  podcastId?: number;
  minDate?: string;
  maxDate?: string;
  maxScore?: number;
}): Promise<{ count: number; error?: string }> {
  const { userId } = await auth();

  if (!userId) {
    return { count: 0, error: "You must be signed in" };
  }

  try {
    const conditions = [isNotNull(episodes.processedAt)];

    if (filters.podcastId !== undefined) {
      conditions.push(eq(episodes.podcastId, filters.podcastId));
    }

    if (filters.minDate) {
      conditions.push(gte(episodes.publishDate, new Date(filters.minDate)));
    }

    if (filters.maxDate) {
      conditions.push(lte(episodes.publishDate, new Date(filters.maxDate)));
    }

    if (filters.maxScore !== undefined) {
      conditions.push(lte(episodes.worthItScore, String(filters.maxScore)));
    }

    const [result] = await db
      .select({ count: count() })
      .from(episodes)
      .where(and(...conditions));

    return { count: result.count };
  } catch (error) {
    console.error("Error counting episodes for re-summarization:", error);
    return { count: 0, error: "Failed to count episodes" };
  }
}
