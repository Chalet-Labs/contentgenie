// @vitest-environment node
// Integration smoke test for resolution-metrics queries against a real Postgres.
// Catches SQL-generation issues that mocked tests can't see — e.g. drizzle
// re-rendering sql template literals into mismatched parameter slots between
// SELECT and GROUP BY (regression for the 2026-05-01 GROUP BY parse error).
// Requires a live DATABASE_URL — skipped in CI (no DATABASE_URL set).
// Run locally: doppler run -- bun run test src/lib/observability/__tests__/resolution-metrics.integration.test.ts

import { describe, it, expect } from "vitest";
import {
  getMatchMethodHistogram,
  getSimilarityHistogram,
  getDisambigForcedCount,
  getMatchMethodTrend,
  getSimilarityTrend,
  detectThresholdDrift,
  windowFromKey,
} from "@/lib/observability/resolution-metrics";

describe.skipIf(!process.env.DATABASE_URL)(
  "resolution-metrics — Postgres SQL validity",
  () => {
    const window7d = windowFromKey("7d");

    it("getMatchMethodHistogram executes against Postgres without parse errors", async () => {
      const result = await getMatchMethodHistogram(window7d);
      expect(result).toEqual(
        expect.objectContaining({
          auto: expect.any(Number),
          llm_disambig: expect.any(Number),
          new: expect.any(Number),
        }),
      );
    });

    it("getSimilarityHistogram executes against Postgres without GROUP BY parse error", async () => {
      const result = await getSimilarityHistogram(window7d);
      expect(result).toHaveLength(20);
      expect(result[0]).toEqual({ bucket: 0, count: expect.any(Number) });
      expect(result[19]?.bucket).toBeCloseTo(0.95, 10);
    });

    it("getDisambigForcedCount executes against Postgres", async () => {
      const result = await getDisambigForcedCount(window7d);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.versionTokenForced).toBeGreaterThanOrEqual(0);
      expect(result.versionTokenForced).toBeLessThanOrEqual(result.total);
    });

    it("getMatchMethodTrend returns MatchMethodTrendEntry[] with correct shape", async () => {
      const result = await getMatchMethodTrend(window7d, "day");
      expect(Array.isArray(result)).toBe(true);
      for (const entry of result) {
        expect(entry.bucket).toBeInstanceOf(Date);
        expect(entry.auto).toBeGreaterThanOrEqual(0);
        expect(entry.llm_disambig).toBeGreaterThanOrEqual(0);
        expect(entry.new).toBeGreaterThanOrEqual(0);
        // total must equal the sum of all method counts
        expect(entry.total).toBe(entry.auto + entry.llm_disambig + entry.new);
      }
    });

    it("getMatchMethodTrend with week granularity executes without SQL errors", async () => {
      const result = await getMatchMethodTrend(window7d, "week");
      expect(Array.isArray(result)).toBe(true);
    });

    it("getSimilarityTrend returns SimilarityTrendEntry[] with full bucket arrays", async () => {
      const result = await getSimilarityTrend(window7d, "day");
      expect(Array.isArray(result)).toBe(true);
      for (const entry of result) {
        expect(entry.bucket).toBeInstanceOf(Date);
        expect(entry.buckets).toHaveLength(20);
        for (const b of entry.buckets) {
          expect(b.bucket).toBeGreaterThanOrEqual(0);
          expect(b.count).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it("detectThresholdDrift returns a valid DriftResult", async () => {
      const result = await detectThresholdDrift(window7d);
      expect(["ok", "warn", "alert"]).toContain(result.status);
      expect(typeof result.reason).toBe("string");
      expect(result.reason.length).toBeGreaterThan(0);
      expect(result.rates.total).toBeGreaterThanOrEqual(0);
      if (result.rates.total > 0) {
        const sumRates =
          result.rates.auto + result.rates.disambig + result.rates.new;
        expect(sumRates).toBeCloseTo(1, 5);
      }
    });

    it("detectThresholdDrift returns ok with total=0 for empty window", async () => {
      // A zero-width window in the far past guarantees no data.
      const emptyWindow = {
        start: new Date("2000-01-01T00:00:00Z"),
        end: new Date("2000-01-01T00:00:01Z"),
      };
      const result = await detectThresholdDrift(emptyWindow);
      expect(result.status).toBe("ok");
      expect(result.rates.total).toBe(0);
    });
  },
);
