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
  },
);
