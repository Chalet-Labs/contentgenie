"use server";

import { auth } from "@clerk/nextjs/server";
import { and, count } from "drizzle-orm";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import { buildResummarizeConditions } from "@/lib/bulk-resummarize-filters";

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
    const conditions = buildResummarizeConditions(filters);

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
