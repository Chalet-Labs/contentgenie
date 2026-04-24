import { db } from "@/db";
import { episodes, podcasts } from "@/db/schema";
import { count, eq, sql } from "drizzle-orm";
import {
  buildEpisodeWhereConditions,
  PAGE_SIZE,
  type EpisodeFilters,
} from "@/lib/admin/episode-filters";

export interface EpisodeRow {
  id: number;
  title: string;
  podcastId: number;
  podcastTitle: string;
  podcastImageUrl: string | null;
  podcastIndexId: string;
  publishDate: Date | null;
  transcriptStatus: string | null;
  transcriptSource: string | null;
  summaryStatus: string | null;
  worthItScore: string | null;
}

export async function getFilteredEpisodes(
  filters: EpisodeFilters,
): Promise<{ rows: EpisodeRow[]; totalCount: number }> {
  const where = buildEpisodeWhereConditions(filters);
  const offset = (filters.page - 1) * PAGE_SIZE;

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: episodes.id,
        title: episodes.title,
        podcastId: episodes.podcastId,
        podcastTitle: podcasts.title,
        podcastImageUrl: podcasts.imageUrl,
        podcastIndexId: episodes.podcastIndexId,
        publishDate: episodes.publishDate,
        transcriptStatus: episodes.transcriptStatus,
        transcriptSource: episodes.transcriptSource,
        summaryStatus: episodes.summaryStatus,
        worthItScore: episodes.worthItScore,
      })
      .from(episodes)
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(where)
      .orderBy(sql`${episodes.updatedAt} DESC`)
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({ value: count() })
      .from(episodes)
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(where),
  ]);

  return {
    rows: rows.map((r) => ({
      ...r,
      worthItScore: r.worthItScore !== null ? String(r.worthItScore) : null,
    })),
    totalCount: Number(countRows[0]?.value ?? 0),
  };
}
