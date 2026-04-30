import "server-only";

import { db } from "@/db";
import { episodeCanonicalTopics } from "@/db/schema";
import { count, sql, and, gte, lte, isNotNull, eq } from "drizzle-orm";

export interface ResolutionMetricRecord {
  matchMethod: "auto" | "llm_disambig" | "new";
  similarityToTopMatch: number | null;
  versionTokenForcedDisambig: boolean;
}

export interface MatchMethodHistogram {
  auto: number;
  llm_disambig: number;
  new: number;
}

export interface SimilarityBucket {
  bucket: number;
  count: number;
}

export interface DisambigForcedCount {
  versionTokenForced: number;
  total: number;
}

/**
 * No-op stub in v1. The canonical write path is the resolver's `insertJunction`,
 * which already persists all dimensions to `episode_canonical_topics`.
 * This function exists as an extension point for B4 (#391) if a separate
 * metrics table is ever introduced. See ADR-046 §6.
 */
export async function recordResolutionMetric(
  _record: ResolutionMetricRecord,
): Promise<void> {
  // Intentional no-op — see JSDoc above.
}

/** Returns time window boundaries for a named key. */
export function windowFromKey(key: "today" | "7d" | "30d"): {
  start: Date;
  end: Date;
} {
  const end = new Date();
  const days = key === "today" ? 1 : key === "7d" ? 7 : 30;
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end };
}

function buildTimeFilter(window?: { start: Date; end: Date }) {
  if (!window) return undefined;
  return and(
    gte(episodeCanonicalTopics.createdAt, window.start),
    lte(episodeCanonicalTopics.createdAt, window.end),
  );
}

/**
 * Returns the distribution of match methods over the given time window.
 * Always returns all three keys (`auto`, `llm_disambig`, `new`),
 * defaulting to 0 for any key not present in the DB result.
 */
export async function getMatchMethodHistogram(window?: {
  start: Date;
  end: Date;
}): Promise<MatchMethodHistogram> {
  const timeFilter = buildTimeFilter(window);

  const query = db
    .select({
      matchMethod: episodeCanonicalTopics.matchMethod,
      count: count(),
    })
    .from(episodeCanonicalTopics)
    .groupBy(episodeCanonicalTopics.matchMethod);

  const rows = await (timeFilter ? query.where(timeFilter) : query);

  const result: MatchMethodHistogram = { auto: 0, llm_disambig: 0, new: 0 };
  for (const row of rows) {
    const method = row.matchMethod as keyof MatchMethodHistogram;
    if (method in result) {
      result[method] = Number(row.count);
    }
  }
  return result;
}

/**
 * Returns the similarity-to-top-match histogram in buckets of `bucketSize`
 * (default 0.05), covering the range 0.00–0.95 (20 buckets).
 * Excludes rows where `similarity_to_top_match IS NULL` (those are
 * pure `match_method='new'` resolutions with no comparison performed).
 * Missing buckets are zero-filled so the dashboard always renders 20 bars.
 */
export async function getSimilarityHistogram(
  window?: { start: Date; end: Date },
  bucketSize: number = 0.05,
): Promise<SimilarityBucket[]> {
  const col = episodeCanonicalTopics.similarityToTopMatch;
  const bucketExpr = sql<number>`floor(${col} / ${bucketSize}) * ${bucketSize}`;

  const nullFilter = isNotNull(col);
  const timeFilter = buildTimeFilter(window);
  const whereClause = timeFilter ? and(nullFilter, timeFilter) : nullFilter;

  const rows = await db
    .select({
      bucket: bucketExpr.mapWith(Number),
      count: count(),
    })
    .from(episodeCanonicalTopics)
    .where(whereClause)
    .groupBy(sql`floor(${col} / ${bucketSize}) * ${bucketSize}`)
    .orderBy(sql`floor(${col} / ${bucketSize}) * ${bucketSize}`);

  // Build a map of bucket → count from DB results
  const bucketMap = new Map<number, number>();
  for (const row of rows) {
    const key = Math.round(row.bucket * 1000) / 1000;
    bucketMap.set(key, Number(row.count));
  }

  // Zero-fill the full 0.00..0.95 range (20 buckets for default bucketSize 0.05)
  const numBuckets = Math.round(1 / bucketSize);
  const result: SimilarityBucket[] = [];
  for (let i = 0; i < numBuckets; i++) {
    const bucket = Math.round(i * bucketSize * 1000) / 1000;
    result.push({ bucket, count: bucketMap.get(bucket) ?? 0 });
  }
  return result;
}

/**
 * Returns the count of resolutions where `version_token_forced_disambig = true`
 * and the total count of junction rows, for the given time window.
 */
export async function getDisambigForcedCount(window?: {
  start: Date;
  end: Date;
}): Promise<DisambigForcedCount> {
  const timeFilter = buildTimeFilter(window);

  const totalQuery = db.select({ value: count() }).from(episodeCanonicalTopics);

  const forcedQuery = db
    .select({ value: count() })
    .from(episodeCanonicalTopics)
    .where(
      timeFilter
        ? and(
            eq(episodeCanonicalTopics.versionTokenForcedDisambig, true),
            timeFilter,
          )
        : eq(episodeCanonicalTopics.versionTokenForcedDisambig, true),
    );

  const [totalRows, forcedRows] = await Promise.all([
    timeFilter ? totalQuery.where(timeFilter) : totalQuery,
    forcedQuery,
  ]);

  return {
    total: Number(totalRows[0]?.value ?? 0),
    versionTokenForced: Number(forcedRows[0]?.value ?? 0),
  };
}
