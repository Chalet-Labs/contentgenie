"use server";

import { auth } from "@clerk/nextjs/server";
import { and, count, eq, isNull, or, desc } from "drizzle-orm";
import { db } from "@/db";
import { episodes, podcasts, type TranscriptStatus } from "@/db/schema";
import { ADMIN_ROLE } from "@/lib/auth-roles";

export interface TranscriptStatsEpisode {
  id: number;
  title: string;
  podcastTitle: string;
  podcastId: number;
  podcastIndexId: string;
  transcriptStatus: TranscriptStatus | null;
  transcriptError: string | null;
  publishDate: Date | null;
}

export interface TranscriptStatsResult {
  totalMissing: number;
  episodes: TranscriptStatsEpisode[];
  podcasts: Array<{ id: number; title: string }>;
  error?: string;
}

export async function getEpisodeTranscriptStats(opts?: {
  page?: number;
  pageSize?: number;
  podcastId?: number;
  skipPodcasts?: boolean;
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

  const conditions = [missingCondition];
  if (opts?.podcastId !== undefined) {
    conditions.push(eq(episodes.podcastId, opts.podcastId));
  }
  const whereClause = and(...conditions);

  // Run independent queries in parallel
  const [countResult, rows, allPodcasts] = await Promise.all([
    db.select({ count: count() }).from(episodes).where(whereClause),
    db
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
      .offset(offset),
    // Skip podcasts query on pagination/filter calls when caller already has the list
    opts?.skipPodcasts
      ? Promise.resolve([])
      : db
          .select({ id: podcasts.id, title: podcasts.title })
          .from(podcasts)
          .orderBy(podcasts.title),
  ]);

  return {
    totalMissing: countResult[0].count,
    episodes: rows,
    podcasts: allPodcasts,
  };
}
