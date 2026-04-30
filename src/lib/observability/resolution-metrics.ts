import "server-only";

import { db } from "@/db";
import { episodeCanonicalTopics } from "@/db/schema";
import { count, sql, and, gte, lte, isNotNull } from "drizzle-orm";
import {
  MATCH_METHODS,
  type MatchMethod,
} from "@/lib/entity-resolution-constants";
import { type WindowKey } from "@/lib/search-params/admin-topics-observability";

export interface ResolutionMetricRecord {
  matchMethod: MatchMethod;
  similarityToTopMatch: number | null;
  versionTokenForcedDisambig: boolean;
}

export type MatchMethodHistogram = Record<MatchMethod, number>;

export interface SimilarityBucket {
  bucket: number;
  count: number;
}

export interface DisambigForcedCount {
  versionTokenForced: number;
  total: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_BUCKET_SIZE = 0.05;

/**
 * No-op stub in v1. The canonical write path is the resolver's `insertJunction`,
 * which already persists all dimensions to `episode_canonical_topics`.
 * This function exists as an extension point for B4 (#391) if a separate
 * metrics table is ever introduced. See ADR-046 §6.
 */
export async function recordResolutionMetric(
  _record: ResolutionMetricRecord,
): Promise<void> {}

/**
 * Returns time window boundaries for a named key.
 *
 * - `"today"` is calendar-aligned: UTC midnight today → now.
 * - `"7d"` and `"30d"` are rolling windows: now − N×24h → now.
 */
export function windowFromKey(key: WindowKey): { start: Date; end: Date } {
  const now = new Date();
  if (key === "today") {
    const d = now;
    const start = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
    return { start, end: now };
  }
  const days = key === "7d" ? 7 : 30;
  const start = new Date(now.getTime() - days * MS_PER_DAY);
  return { start, end: now };
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
 * Always returns all keys from `MATCH_METHODS`, defaulting to 0 for any
 * key not present in the DB result.
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

  const result = Object.fromEntries(
    MATCH_METHODS.map((m) => [m, 0]),
  ) as MatchMethodHistogram;
  for (const row of rows) {
    const method = row.matchMethod as MatchMethod;
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
 * Similarity = 1.0 (exact-lookup hits) is capped into the 0.95 bucket via `least()`.
 */
export async function getSimilarityHistogram(
  window?: { start: Date; end: Date },
  bucketSize: number = DEFAULT_BUCKET_SIZE,
): Promise<SimilarityBucket[]> {
  const col = episodeCanonicalTopics.similarityToTopMatch;
  const bucketExpr = sql<number>`least(floor(${col} / ${bucketSize}) * ${bucketSize}, 0.95)`;

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
    .groupBy(
      sql<number>`least(floor(${col} / ${bucketSize}) * ${bucketSize}, 0.95)`,
    )
    .orderBy(
      sql<number>`least(floor(${col} / ${bucketSize}) * ${bucketSize}, 0.95)`,
    );

  const bucketMap = new Map<number, number>();
  for (const row of rows) {
    const key = Math.round(row.bucket * 1000) / 1000;
    bucketMap.set(key, Number(row.count));
  }

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

  const result = await db.execute(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE version_token_forced_disambig)::int AS forced
    FROM episode_canonical_topics
    ${timeFilter ? sql`WHERE created_at >= ${window!.start} AND created_at <= ${window!.end}` : sql``}
  `);
  const { total, forced } = result.rows[0] as {
    total: number;
    forced: number;
  };
  return { total: Number(total), versionTokenForced: Number(forced) };
}
