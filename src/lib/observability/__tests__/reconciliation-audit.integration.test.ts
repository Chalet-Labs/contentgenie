// @vitest-environment node
// Integration smoke test for getReconciliationAuditLog against a real Postgres.
// Verifies SQL generation, ORDER BY, LIMIT, and window-filter branches.
// Requires a live DATABASE_URL — skipped in CI (no DATABASE_URL set).
// Run locally: doppler run -- bun run test src/lib/observability/__tests__/reconciliation-audit.integration.test.ts

import { describe, it, expect } from "vitest";
import { getReconciliationAuditLog } from "@/lib/observability/reconciliation-audit";

describe.skipIf(!process.env.DATABASE_URL)(
  "reconciliation-audit — Postgres SQL validity",
  () => {
    it("getReconciliationAuditLog executes without SQL errors and returns an array", async () => {
      const result = await getReconciliationAuditLog();
      expect(Array.isArray(result)).toBe(true);
    });

    it("returned entries carry all expected audit fields", async () => {
      const result = await getReconciliationAuditLog();
      for (const entry of result) {
        expect(typeof entry.id).toBe("number");
        expect(typeof entry.runId).toBe("string");
        expect(typeof entry.clusterIndex).toBe("number");
        expect(typeof entry.clusterSize).toBe("number");
        expect(Array.isArray(entry.loserIds)).toBe(true);
        expect(Array.isArray(entry.verifiedLoserIds)).toBe(true);
        expect(Array.isArray(entry.rejectedLoserIds)).toBe(true);
        expect([
          "merged",
          "partial",
          "rejected",
          "skipped",
          "failed",
        ]).toContain(entry.outcome);
        expect(entry.createdAt).toBeInstanceOf(Date);
      }
    });

    it("respects the limit parameter", async () => {
      const result = await getReconciliationAuditLog(undefined, 3);
      expect(result.length).toBeLessThanOrEqual(3);
    });

    it("returns [] for a far-past window that matches no rows", async () => {
      const window = {
        start: new Date("2000-01-01T00:00:00Z"),
        end: new Date("2000-01-01T00:00:01Z"),
      };
      const result = await getReconciliationAuditLog(window);
      expect(result).toEqual([]);
    });

    it("window filter returns only entries within the range", async () => {
      const end = new Date();
      const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      const result = await getReconciliationAuditLog({ start, end });
      expect(Array.isArray(result)).toBe(true);
      for (const entry of result) {
        expect(entry.createdAt.getTime()).toBeGreaterThanOrEqual(
          start.getTime(),
        );
        expect(entry.createdAt.getTime()).toBeLessThanOrEqual(end.getTime());
      }
    });
  },
);
