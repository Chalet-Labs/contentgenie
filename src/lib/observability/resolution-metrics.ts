import "server-only";

import { db } from "@/db";
import { episodeCanonicalTopics } from "@/db/schema";
import { count, sql, and, gte, lte, isNotNull } from "drizzle-orm";
import {
  MATCH_METHODS,
  type MatchMethod,
} from "@/lib/entity-resolution-constants";
import {
  type WindowKey,
  type GranularityKey,
} from "@/lib/search-params/admin-topics-observability";
import {
  DRIFT_AUTO_RATE_FLOOR,
  DRIFT_AUTO_RATE_WARN,
  DRIFT_DISAMBIG_RATE_CEILING,
  DRIFT_DISAMBIG_RATE_WARN,
  type DriftStatus,
} from "@/lib/observability/drift-thresholds";

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
const MS_PER_WEEK = 7 * MS_PER_DAY;
const DEFAULT_BUCKET_SIZE = 0.05;

/**
 * No-op stub in v1. The canonical write path is the resolver's `insertJunction`,
 * which already persists all dimensions to `episode_canonical_topics`.
 * This function exists as an extension point for B4 (#391) if a separate
 * metrics table is ever introduced. See ADR-047 §6.
 */
export async function recordResolutionMetric(
  _record: ResolutionMetricRecord,
): Promise<void> {}

/**
 * Returns time window boundaries for a named key.
 *
 * All windows are rolling: `start = now − N×24h`, `end = now`.
 * `24h` covers the last 24 hours; `7d` and `30d` cover the last 7 / 30 days.
 */
export function windowFromKey(key: WindowKey): { start: Date; end: Date } {
  const now = new Date();
  let days: number;
  switch (key) {
    case "24h":
      days = 1;
      break;
    case "7d":
      days = 7;
      break;
    case "30d":
      days = 30;
      break;
    default: {
      const _exhaustive: never = key;
      throw new Error(`Unhandled WindowKey: ${String(_exhaustive)}`);
    }
  }
  const start = new Date(now.getTime() - days * MS_PER_DAY);
  return { start, end: now };
}

function buildTimeFilter(window?: { start: Date; end: Date }) {
  if (!window) return undefined;
  // Filter on `updatedAt` (advances to now() on every ON CONFLICT DO UPDATE
  // in `insertJunction`) so retries and recovery-path re-resolutions land
  // in the window where they were observed, not the window of the first
  // write — see ADR-047 §"Schema" and entity-resolution.ts insertJunction.
  return and(
    gte(episodeCanonicalTopics.updatedAt, window.start),
    lte(episodeCanonicalTopics.updatedAt, window.end),
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
 * (default 0.05). Excludes rows where `similarity_to_top_match IS NULL` (those
 * are pure `match_method='new'` resolutions with no comparison performed).
 * Missing buckets are zero-filled so the dashboard always renders a full set.
 * Similarity = 1.0 (exact-lookup hits) is capped into the last bucket via `least()`.
 */
export async function getSimilarityHistogram(
  window?: { start: Date; end: Date },
  bucketSize: number = DEFAULT_BUCKET_SIZE,
): Promise<SimilarityBucket[]> {
  if (!Number.isFinite(bucketSize) || bucketSize <= 0 || bucketSize > 1) {
    throw new RangeError("bucketSize must be a finite number in (0, 1]");
  }
  const col = episodeCanonicalTopics.similarityToTopMatch;
  const numBuckets = Math.ceil(1 / bucketSize);
  const maxBucket = (numBuckets - 1) * bucketSize;
  const bucketExpr = sql<number>`least(floor(${col} / ${bucketSize}) * ${bucketSize}, ${maxBucket})`;

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
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const bucketMap = new Map<number, number>();
  for (const row of rows) {
    const idx = Math.round(row.bucket / bucketSize);
    bucketMap.set(idx, Number(row.count));
  }

  const result: SimilarityBucket[] = [];
  for (let i = 0; i < numBuckets; i++) {
    const bucket = Math.round(i * bucketSize * 1e10) / 1e10;
    result.push({ bucket, count: bucketMap.get(i) ?? 0 });
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

  const query = db
    .select({
      total: count().mapWith(Number),
      forced:
        sql<number>`count(*) FILTER (WHERE ${episodeCanonicalTopics.versionTokenForcedDisambig})`.mapWith(
          Number,
        ),
    })
    .from(episodeCanonicalTopics);

  const result = await (timeFilter ? query.where(timeFilter) : query);

  const row = result[0];
  return { total: row?.total ?? 0, versionTokenForced: row?.forced ?? 0 };
}

// ─── Trend types (T5/T6, ADR-053) ────────────────────────────────────────────

export interface MatchMethodTrendEntry {
  bucket: Date;
  auto: number;
  llm_disambig: number;
  new: number;
  total: number;
}

export interface SimilarityTrendEntry {
  bucket: Date;
  buckets: SimilarityBucket[];
}

export interface DriftResult {
  status: DriftStatus;
  reason: string;
  rates: {
    auto: number;
    disambig: number;
    new: number;
    total: number;
  };
}

// ─── Bucket range generator ───────────────────────────────────────────────────

/** Generate UTC-midnight date boundaries from window start to end, stepping by granularity. */
function generateBucketRange(
  window: { start: Date; end: Date },
  granularity: GranularityKey,
): Date[] {
  let current = new Date(
    Date.UTC(
      window.start.getUTCFullYear(),
      window.start.getUTCMonth(),
      window.start.getUTCDate(),
    ),
  );
  if (granularity === "week") {
    // Postgres date_trunc('week', t) returns ISO-week Monday boundaries.
    // Snap to the preceding Monday so generated keys align with DB keys.
    // (dow + 6) % 7 maps Sun→6, Mon→0, Tue→1, ..., Sat→5 (days since Monday).
    const daysFromMonday = (current.getUTCDay() + 6) % 7;
    current = new Date(current.getTime() - daysFromMonday * MS_PER_DAY);
  }
  const stepMs = granularity === "week" ? MS_PER_WEEK : MS_PER_DAY;
  const dates: Date[] = [];
  while (current.getTime() <= window.end.getTime()) {
    dates.push(current);
    current = new Date(current.getTime() + stepMs);
  }
  return dates;
}

// ─── Trend query functions ────────────────────────────────────────────────────

/**
 * Returns the match-method distribution as a time series bucketed by
 * `date_trunc(granularity, updated_at)`. Each entry is zero-filled for any
 * bucket in the window with no resolutions. Filters on `updatedAt` per
 * ADR-047 §3.
 */
export async function getMatchMethodTrend(
  window: { start: Date; end: Date },
  granularity: GranularityKey,
): Promise<MatchMethodTrendEntry[]> {
  const timeFilter = buildTimeFilter(window);
  const col = episodeCanonicalTopics.updatedAt;

  const bucketExpr = sql<Date>`date_trunc(${granularity}, ${col})`;

  const query = db
    .select({
      bucket: bucketExpr,
      matchMethod: episodeCanonicalTopics.matchMethod,
      count: count(),
    })
    .from(episodeCanonicalTopics)
    .groupBy(sql`1`, episodeCanonicalTopics.matchMethod);

  const rows = await (timeFilter ? query.where(timeFilter) : query);

  // Aggregate DB rows by bucket key
  const byBucket = new Map<string, MatchMethodTrendEntry>();
  for (const row of rows) {
    const bucket =
      row.bucket instanceof Date ? row.bucket : new Date(row.bucket as string);
    const key = bucket.toISOString();
    if (!byBucket.has(key)) {
      byBucket.set(key, {
        bucket,
        auto: 0,
        llm_disambig: 0,
        new: 0,
        total: 0,
      });
    }
    const entry = byBucket.get(key)!;
    const n = Number(row.count);
    const method = row.matchMethod as MatchMethod;
    if (method === "auto") entry.auto += n;
    else if (method === "llm_disambig") entry.llm_disambig += n;
    else if (method === "new") entry.new += n;
    entry.total += n;
  }

  // Zero-fill every bucket in the window range
  return generateBucketRange(window, granularity).map((bucket) => {
    const key = bucket.toISOString();
    return (
      byBucket.get(key) ?? {
        bucket,
        auto: 0,
        llm_disambig: 0,
        new: 0,
        total: 0,
      }
    );
  });
}

/**
 * Returns similarity-bucket counts as a time series bucketed by
 * `date_trunc(granularity, updated_at)`. Each time-bucket entry carries a
 * full `SimilarityBucket[]` (same shape as `getSimilarityHistogram`).
 * Filters on `updatedAt` per ADR-047 §3.
 */
export async function getSimilarityTrend(
  window: { start: Date; end: Date },
  granularity: GranularityKey,
): Promise<SimilarityTrendEntry[]> {
  const timeFilter = buildTimeFilter(window);
  const col = episodeCanonicalTopics.updatedAt;
  const simCol = episodeCanonicalTopics.similarityToTopMatch;

  const bucketSize = DEFAULT_BUCKET_SIZE;
  const numBuckets = Math.ceil(1 / bucketSize);
  const maxBucket = (numBuckets - 1) * bucketSize;

  const bucketExpr = sql<Date>`date_trunc(${granularity}, ${col})`;
  const simBucketExpr = sql<number>`least(floor(${simCol} / ${bucketSize}) * ${bucketSize}, ${maxBucket})`;

  const nullFilter = isNotNull(simCol);
  const whereClause = timeFilter ? and(nullFilter, timeFilter) : nullFilter;

  const rows = await db
    .select({
      bucket: bucketExpr,
      similarityBucket: simBucketExpr,
      count: count(),
    })
    .from(episodeCanonicalTopics)
    .where(whereClause)
    .groupBy(sql`1`, sql`2`);

  // Group by time bucket, collecting similarity bucket counts
  const byBucket = new Map<string, Map<number, number>>();
  for (const row of rows) {
    const bucket =
      row.bucket instanceof Date ? row.bucket : new Date(row.bucket as string);
    const key = bucket.toISOString();
    let counts = byBucket.get(key);
    if (!counts) {
      counts = new Map();
      byBucket.set(key, counts);
    }
    const simIdx = Math.round(Number(row.similarityBucket) / bucketSize);
    counts.set(simIdx, Number(row.count));
  }

  // Zero-fill every bucket in the window range so consumers always get the
  // full time-bucket grid. Mirrors `getMatchMethodTrend`'s behavior — without
  // this, the heatmap silently drops empty days/weeks and misaligns the X axis.
  const emptyBuckets = (): SimilarityBucket[] => {
    const arr: SimilarityBucket[] = [];
    for (let i = 0; i < numBuckets; i++) {
      const bucket = Math.round(i * bucketSize * 1e10) / 1e10;
      arr.push({ bucket, count: 0 });
    }
    return arr;
  };

  return generateBucketRange(window, granularity).map((bucket) => {
    const key = bucket.toISOString();
    const counts = byBucket.get(key);
    if (!counts) {
      return { bucket, buckets: emptyBuckets() };
    }
    const bucketArray: SimilarityBucket[] = [];
    for (let i = 0; i < numBuckets; i++) {
      const sim = Math.round(i * bucketSize * 1e10) / 1e10;
      bucketArray.push({ bucket: sim, count: counts.get(i) ?? 0 });
    }
    return { bucket, buckets: bucketArray };
  });
}

/**
 * Derives the current drift status from a match-method histogram.
 * Alert wins over warn when multiple thresholds are violated simultaneously.
 * Returns `status: "ok"` with `total === 0` to guard against divide-by-zero
 * on empty windows (ADR-053 §5).
 *
 * Pure of IO — pass the histogram in. The page server component fetches it
 * once via `getMatchMethodHistogram(window)` and feeds the same value to both
 * the distribution panel and this drift check, avoiding a redundant query.
 */
export function detectThresholdDrift(
  histogram: MatchMethodHistogram,
): DriftResult {
  const total = histogram.auto + histogram.llm_disambig + histogram.new;

  if (total === 0) {
    return {
      status: "ok",
      reason: "No resolutions in window",
      rates: { auto: 0, disambig: 0, new: 0, total: 0 },
    };
  }

  const autoRate = histogram.auto / total;
  const disambigRate = histogram.llm_disambig / total;
  const newRate = histogram.new / total;
  const rates = { auto: autoRate, disambig: disambigRate, new: newRate, total };

  // Alert check first — alert wins over warn (ADR-053 §5)
  if (autoRate < DRIFT_AUTO_RATE_FLOOR) {
    return {
      status: "alert",
      reason: `auto-match rate ${autoRate.toFixed(2)} below alert floor ${DRIFT_AUTO_RATE_FLOOR}`,
      rates,
    };
  }
  if (disambigRate > DRIFT_DISAMBIG_RATE_CEILING) {
    return {
      status: "alert",
      reason: `llm_disambig rate ${disambigRate.toFixed(2)} above alert ceiling ${DRIFT_DISAMBIG_RATE_CEILING}`,
      rates,
    };
  }

  // Warn check
  if (autoRate < DRIFT_AUTO_RATE_WARN) {
    return {
      status: "warn",
      reason: `auto-match rate ${autoRate.toFixed(2)} below warn threshold ${DRIFT_AUTO_RATE_WARN}`,
      rates,
    };
  }
  if (disambigRate > DRIFT_DISAMBIG_RATE_WARN) {
    return {
      status: "warn",
      reason: `llm_disambig rate ${disambigRate.toFixed(2)} above warn threshold ${DRIFT_DISAMBIG_RATE_WARN}`,
      rates,
    };
  }

  return {
    status: "ok",
    reason: "All metrics within healthy bounds",
    rates,
  };
}
