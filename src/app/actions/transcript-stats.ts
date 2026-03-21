"use server";

import { auth } from "@clerk/nextjs/server";
import { and, count, eq, isNull, or, desc } from "drizzle-orm";
import { db } from "@/db";
import { episodes, podcasts } from "@/db/schema";
import { ADMIN_ROLE } from "@/lib/auth-roles";

interface TranscriptStatsEpisode {
  id: number;
  title: string;
  podcastTitle: string;
  podcastId: number;
  podcastIndexId: string;
  transcriptStatus: string | null;
  transcriptError: string | null;
  publishDate: Date | null;
}

interface TranscriptStatsResult {
  totalMissing: number;
  episodes: TranscriptStatsEpisode[];
  podcasts: Array<{ id: number; title: string }>;
  error?: string;
}

export async function getEpisodeTranscriptStats(opts?: {
  page?: number;
  pageSize?: number;
  podcastId?: number;
}): Promise<TranscriptStatsResult> {
  const { userId, has } = await auth();
  if (!userId || !has({ role: ADMIN_ROLE })) {
    return { totalMissing: 0, episodes: [], podcasts: [], error: "Unauthorized" };
  }

  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 10;
  const offset = (page - 1) * pageSize;

  // Include 'fetching' so stale rows from failed/crashed runs remain visible
  const missingCondition = or(
    isNull(episodes.transcriptStatus),
    eq(episodes.transcriptStatus, "missing"),
    eq(episodes.transcriptStatus, "failed"),
    eq(episodes.transcriptStatus, "fetching")
  );

  // Build conditions: always filter by missing status, optionally by podcast
  const conditions = [missingCondition];
  if (opts?.podcastId !== undefined) {
    conditions.push(eq(episodes.podcastId, opts.podcastId));
  }
  const whereClause = and(...conditions);

  // Count total
  const [countResult] = await db
    .select({ count: count() })
    .from(episodes)
    .where(whereClause);

  // Paginated list with podcast title join
  const rows = await db
    .select({
      id: episodes.id,
      title: episodes.title,
      podcastTitle: podcasts.title,
      podcastId: episodes.podcastId,
      podcastIndexId: episodes.podcastIndexId,
      transcriptStatus: episodes.transcriptStatus,
      transcriptError: episodes.transcriptError,
      publishDate: episodes.publishDate,
    })
    .from(episodes)
    .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
    .where(whereClause)
    .orderBy(desc(episodes.publishDate))
    .limit(pageSize)
    .offset(offset);

  // Load all podcasts for dropdown filter (admin sees all, not just subscriptions)
  const allPodcasts = await db
    .select({ id: podcasts.id, title: podcasts.title })
    .from(podcasts)
    .orderBy(podcasts.title);

  return {
    totalMissing: countResult.count,
    episodes: rows,
    podcasts: allPodcasts,
  };
}
