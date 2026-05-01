// @vitest-environment node

/**
 * Tests for mergeCanonicals + unmergeCanonicals helpers.
 *
 * NEW MOCKING CONVENTION: @/db/pool is mocked so that transactional() directly
 * invokes fn(mockTx), where mockTx is a recording tx that captures every
 * tx.execute() call in order. Tests inspect call order and arguments to assert
 * correctness of the two-sequential-statement junction rewrite pattern and the
 * advisory-lock sort ordering.
 *
 * Fixture matching uses plain strings (not regex with .*) because serializeSql
 * produces SQL text with embedded newlines, and .* does not match across lines.
 */

import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as schema from "@/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Recording tx infrastructure -------------------------------------------

interface RecordedCall {
  sql: string;
  params: unknown[];
}

function serializeSql(sqlObj: unknown): { sqlText: string; params: unknown[] } {
  const params: unknown[] = [];
  const parts: string[] = [];
  const visit = (chunk: unknown) => {
    if (chunk == null) return;
    if (Array.isArray(chunk)) {
      chunk.forEach(visit);
      return;
    }
    if (
      typeof chunk === "string" ||
      typeof chunk === "number" ||
      typeof chunk === "boolean"
    ) {
      params.push(chunk);
      parts.push("$");
      return;
    }
    const obj = chunk as { value?: unknown; queryChunks?: unknown[] };
    if (Array.isArray(obj.queryChunks)) {
      obj.queryChunks.forEach(visit);
      return;
    }
    if (Array.isArray(obj.value)) {
      parts.push(obj.value.join(""));
      return;
    }
    if (obj.value !== undefined) {
      params.push(obj.value);
      parts.push("$");
      return;
    }
  };
  visit(sqlObj);
  return { sqlText: parts.join(" "), params };
}

type ResolveRows = (sqlText: string, params: unknown[]) => unknown[];

function createRecordingTx(resolveRows: ResolveRows): {
  execute: (sqlObj: unknown) => Promise<{ rows: unknown[]; rowCount?: number }>;
  _calls: RecordedCall[];
} {
  const _calls: RecordedCall[] = [];
  return {
    _calls,
    execute: async (sqlObj: unknown) => {
      const { sqlText, params } = serializeSql(sqlObj);
      _calls.push({ sql: sqlText, params });
      const rows = resolveRows(sqlText, params);
      return { rows, rowCount: rows.length };
    },
  };
}

interface SqlFixture {
  match: string | RegExp;
  rows: unknown[];
}

const txFixturesQueue: SqlFixture[][] = [];
let lastTx: ReturnType<typeof createRecordingTx> | null = null;

// NEW MOCKING CONVENTION for @/db/pool.
// vi.mock is hoisted to the top of the file by Vitest.
vi.mock("@/db/pool", () => ({
  transactional: vi.fn(
    async (fn: (tx: unknown) => Promise<unknown>, opts?: { tx?: unknown }) => {
      if (opts?.tx) return fn(opts.tx);
      const fixtures = txFixturesQueue.shift() ?? [];
      const tx = createRecordingTx((sqlText) => {
        const fixtureIndex = fixtures.findIndex((f) =>
          typeof f.match === "string"
            ? sqlText.includes(f.match)
            : f.match.test(sqlText),
        );
        if (fixtureIndex < 0) return [];
        const [fixture] = fixtures.splice(fixtureIndex, 1);
        return fixture.rows;
      });
      lastTx = tx;
      return fn(tx);
    },
  ),
}));

// Stub modules transitively imported by database.ts but not under test here.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({
  episodes: {},
  episodeTopics: {},
  podcasts: {},
  canonicalTopicAdminLog: {},
}));
vi.mock("@/db/helpers", () => ({ upsertPodcast: vi.fn() }));
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual, eq: vi.fn() };
});

// ---------------------------------------------------------------------------

function setTxFixtures(fixtures: SqlFixture[]): void {
  txFixturesQueue.push(fixtures);
}

function getTxCalls(): RecordedCall[] {
  return lastTx?._calls ?? [];
}

function findCalls(calls: RecordedCall[], needle: string): RecordedCall[] {
  return calls.filter((c) =>
    c.sql.toLowerCase().includes(needle.toLowerCase()),
  );
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  txFixturesQueue.length = 0;
  lastTx = null;
});

afterEach(() => {
  txFixturesQueue.length = 0;
  lastTx = null;
  vi.clearAllMocks();
});

// ===========================================================================
// mergeCanonicals
// ===========================================================================

describe("mergeCanonicals", () => {
  it("(1) rejects self-merge before issuing SQL", async () => {
    const { mergeCanonicals } = await import("@/trigger/helpers/database");
    // Supply a tx to avoid fixture machinery; the guard throws before any SQL.
    const callerTx = createRecordingTx(() => []);
    await expect(
      mergeCanonicals(
        { loserId: 5, winnerId: 5, actor: "user_1" },
        { tx: callerTx as unknown as NeonDatabase<typeof schema> },
      ),
    ).rejects.toThrow("self-merge");
    expect(callerTx._calls).toHaveLength(0);
  });

  it("(2) advisory-lock key is sorted-pair JSON.stringify([min, max])", async () => {
    setTxFixtures([
      {
        match: "FOR UPDATE",
        rows: [
          { id: 3, status: "active" },
          { id: 7, status: "active" },
        ],
      },
      { match: "DELETE FROM episode_canonical_topics", rows: [] },
      { match: "UPDATE episode_canonical_topics", rows: [{ episode_id: 10 }] },
      { match: "SET status = 'merged'", rows: [{ id: 3 }] },
      { match: "canonical_topic_aliases", rows: [] },
      { match: "canonical_topic_admin_log", rows: [{ id: 1 }] },
    ]);

    const { mergeCanonicals } = await import("@/trigger/helpers/database");
    // loser=7, winner=3 — winner < loser so sorted pair is [3,7]
    await mergeCanonicals({ loserId: 7, winnerId: 3, actor: "user_1" });

    const lockCalls = findCalls(getTxCalls(), "pg_advisory_xact_lock");
    expect(lockCalls).toHaveLength(1);

    const lockKeyParam = lockCalls[0].params.find(
      (p) => typeof p === "string" && p.startsWith("["),
    );
    expect(lockKeyParam).toBeDefined();
    const parsed = JSON.parse(lockKeyParam as string) as [number, number];
    expect(parsed[0]).toBe(3);
    expect(parsed[1]).toBe(7);
  });

  it("(3) merge happy path — conflicts deleted, survivors updated, status flipped, aliases copied, audit row written", async () => {
    setTxFixtures([
      {
        match: "FOR UPDATE",
        rows: [
          { id: 1, status: "active" },
          { id: 2, status: "active" },
        ],
      },
      {
        match: "DELETE FROM episode_canonical_topics",
        rows: [{ episode_id: 10 }, { episode_id: 11 }],
      },
      { match: "UPDATE episode_canonical_topics", rows: [{ episode_id: 12 }] },
      { match: "SET status = 'merged'", rows: [{ id: 1 }] },
      { match: "canonical_topic_aliases", rows: [] },
      { match: "canonical_topic_admin_log", rows: [{ id: 99 }] },
    ]);

    const { mergeCanonicals } = await import("@/trigger/helpers/database");
    const result = await mergeCanonicals({
      loserId: 1,
      winnerId: 2,
      actor: "user_a",
    });

    expect(result.loserId).toBe(1);
    expect(result.winnerId).toBe(2);
    expect(result.conflictsDropped).toBe(2);
    expect(result.episodesReassigned).toBe(1);

    const calls = getTxCalls();
    expect(
      findCalls(calls, "DELETE FROM episode_canonical_topics"),
    ).toHaveLength(1);
    expect(findCalls(calls, "UPDATE episode_canonical_topics")).toHaveLength(1);
    expect(findCalls(calls, "canonical_topic_admin_log")).toHaveLength(1);
  });

  it("(4) merge idempotent: 0-row status UPDATE treated as no-op (no throw)", async () => {
    setTxFixtures([
      {
        match: "FOR UPDATE",
        rows: [
          { id: 1, status: "active" },
          { id: 2, status: "active" },
        ],
      },
      { match: "DELETE FROM episode_canonical_topics", rows: [] },
      { match: "UPDATE episode_canonical_topics", rows: [] },
      { match: "SET status = 'merged'", rows: [] },
      { match: "canonical_topic_aliases", rows: [] },
      { match: "canonical_topic_admin_log", rows: [{ id: 2 }] },
    ]);

    const { mergeCanonicals } = await import("@/trigger/helpers/database");
    const result = await mergeCanonicals({
      loserId: 1,
      winnerId: 2,
      actor: "user_b",
    });
    expect(result.episodesReassigned).toBe(0);
    expect(result.conflictsDropped).toBe(0);
  });

  it("(5) optional tx is honored — transactional() is called with opts.tx", async () => {
    const { transactional } = await import("@/db/pool");
    const transactionalMock = vi.mocked(transactional);
    const callsBefore = transactionalMock.mock.calls.length;

    const callerTx = createRecordingTx(() => []);
    const typedCallerTx = callerTx as unknown as NeonDatabase<typeof schema>;
    const { mergeCanonicals } = await import("@/trigger/helpers/database");
    await mergeCanonicals(
      { loserId: 1, winnerId: 2, actor: "user_c" },
      { tx: typedCallerTx },
    ).catch(() => {
      // May throw due to empty rows — that's fine for this coverage path.
    });

    const callsAfter = transactionalMock.mock.calls.length;
    expect(callsAfter).toBe(callsBefore + 1);
    const lastCall =
      transactionalMock.mock.calls[transactionalMock.mock.calls.length - 1];
    expect(lastCall[1]).toEqual({ tx: typedCallerTx });
  });

  it("(6) junction rewrite: DELETE issued BEFORE UPDATE (regression guard against combined CTE)", async () => {
    setTxFixtures([
      {
        match: "FOR UPDATE",
        rows: [
          { id: 10, status: "active" },
          { id: 20, status: "active" },
        ],
      },
      { match: "DELETE FROM episode_canonical_topics", rows: [] },
      { match: "UPDATE episode_canonical_topics", rows: [{ episode_id: 5 }] },
      { match: "SET status = 'merged'", rows: [{ id: 10 }] },
      { match: "canonical_topic_aliases", rows: [] },
      { match: "canonical_topic_admin_log", rows: [{ id: 3 }] },
    ]);

    const { mergeCanonicals } = await import("@/trigger/helpers/database");
    await mergeCanonicals({ loserId: 10, winnerId: 20, actor: "user_d" });

    const calls = getTxCalls();
    const deleteIdx = calls.findIndex((c) =>
      c.sql.toLowerCase().includes("delete from episode_canonical_topics"),
    );
    const updateJunctionIdx = calls.findIndex((c) =>
      c.sql.toLowerCase().includes("update episode_canonical_topics"),
    );
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(updateJunctionIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeLessThan(updateJunctionIdx);
  });

  it("(11-merge) audit log metadata captures conflict episode_ids", async () => {
    setTxFixtures([
      {
        match: "FOR UPDATE",
        rows: [
          { id: 1, status: "active" },
          { id: 2, status: "active" },
        ],
      },
      {
        match: "DELETE FROM episode_canonical_topics",
        rows: [{ episode_id: 41 }, { episode_id: 42 }],
      },
      { match: "UPDATE episode_canonical_topics", rows: [{ episode_id: 43 }] },
      { match: "SET status = 'merged'", rows: [{ id: 1 }] },
      { match: "canonical_topic_aliases", rows: [] },
      { match: "canonical_topic_admin_log", rows: [{ id: 5 }] },
    ]);

    const { mergeCanonicals } = await import("@/trigger/helpers/database");
    const result = await mergeCanonicals({
      loserId: 1,
      winnerId: 2,
      actor: "user_e",
    });

    expect(result.conflictsDropped).toBe(2);

    const auditCall = findCalls(getTxCalls(), "canonical_topic_admin_log")[0];
    const metadataParam = auditCall?.params.find(
      (p) => typeof p === "string" && p.includes("conflict_episode_ids"),
    );
    expect(metadataParam).toBeDefined();
    expect(JSON.parse(metadataParam as string)).toMatchObject({
      conflict_episode_ids: [41, 42],
    });
  });

  it("(12-merge) metadata.reassigned is an array of episode IDs (regression guard)", async () => {
    setTxFixtures([
      {
        match: "FOR UPDATE",
        rows: [
          { id: 1, status: "active" },
          { id: 2, status: "active" },
        ],
      },
      {
        match: "DELETE FROM episode_canonical_topics",
        rows: [{ episode_id: 50 }],
      },
      {
        match: "UPDATE episode_canonical_topics",
        rows: [{ episode_id: 51 }, { episode_id: 52 }, { episode_id: 53 }],
      },
      { match: "SET status = 'merged'", rows: [{ id: 1 }] },
      { match: "canonical_topic_aliases", rows: [] },
      { match: "canonical_topic_admin_log", rows: [{ id: 7 }] },
    ]);

    const { mergeCanonicals } = await import("@/trigger/helpers/database");
    await mergeCanonicals({ loserId: 1, winnerId: 2, actor: "user_f" });

    const auditCall = findCalls(getTxCalls(), "canonical_topic_admin_log")[0];
    const metadataParam = auditCall?.params.find(
      (p) => typeof p === "string" && p.includes("reassigned"),
    );
    const meta = JSON.parse(metadataParam as string) as {
      reassigned: unknown;
      conflict_episode_ids: unknown;
    };
    expect(Array.isArray(meta.reassigned)).toBe(true);
    expect(meta.reassigned).toEqual([51, 52, 53]);
    expect(Array.isArray(meta.conflict_episode_ids)).toBe(true);
    expect(meta.conflict_episode_ids).toEqual([50]);
  });

  it("(13-merge) rejects already-merged loser with not-active error (no audit row written)", async () => {
    setTxFixtures([
      {
        match: "FOR UPDATE",
        rows: [
          { id: 1, status: "merged" },
          { id: 2, status: "active" },
        ],
      },
    ]);

    const { mergeCanonicals } = await import("@/trigger/helpers/database");
    await expect(
      mergeCanonicals({ loserId: 1, winnerId: 2, actor: "user_g" }),
    ).rejects.toThrow("not-active");

    expect(findCalls(getTxCalls(), "canonical_topic_admin_log")).toHaveLength(
      0,
    );
    expect(
      findCalls(getTxCalls(), "DELETE FROM episode_canonical_topics"),
    ).toHaveLength(0);
  });
});

// ===========================================================================
// unmergeCanonicals
// ===========================================================================

describe("unmergeCanonicals", () => {
  it("(7) unmerge happy path with default alsoRemoveFromWinner=true removes winner junction rows", async () => {
    setTxFixtures([
      {
        match: /SELECT status, merged_into_id FROM canonical_topics/,
        rows: [{ status: "merged", merged_into_id: 9 }],
      },
      { match: "pg_advisory_xact_lock", rows: [] },
      {
        match: "FOR UPDATE",
        rows: [{ id: 5, status: "merged", merged_into_id: 9 }],
      },
      { match: "SET status = 'active'", rows: [{ id: 5 }] },
      { match: "INSERT INTO episode_canonical_topics", rows: [{ id: 100 }] },
      { match: "DELETE FROM episode_canonical_topics", rows: [{ id: 200 }] },
      { match: "canonical_topic_admin_log", rows: [{ id: 10 }] },
    ]);

    const { unmergeCanonicals } = await import("@/trigger/helpers/database");
    const result = await unmergeCanonicals({
      loserId: 5,
      episodeIdsToReassign: [77],
      actor: "user_f",
    });

    expect(result.previousWinnerId).toBe(9);
    expect(result.loserId).toBe(5);

    const calls = getTxCalls();
    expect(
      findCalls(calls, "DELETE FROM episode_canonical_topics"),
    ).toHaveLength(1);
  });

  it("(8) unmerge with alsoRemoveFromWinner=false leaves winner rows intact", async () => {
    setTxFixtures([
      {
        match: /SELECT status, merged_into_id FROM canonical_topics/,
        rows: [{ status: "merged", merged_into_id: 9 }],
      },
      { match: "pg_advisory_xact_lock", rows: [] },
      {
        match: "FOR UPDATE",
        rows: [{ id: 5, status: "merged", merged_into_id: 9 }],
      },
      { match: "SET status = 'active'", rows: [{ id: 5 }] },
      { match: "INSERT INTO episode_canonical_topics", rows: [{ id: 100 }] },
      { match: "canonical_topic_admin_log", rows: [{ id: 11 }] },
    ]);

    const { unmergeCanonicals } = await import("@/trigger/helpers/database");
    const result = await unmergeCanonicals({
      loserId: 5,
      episodeIdsToReassign: [77],
      actor: "user_g",
      alsoRemoveFromWinner: false,
    });

    expect(result.episodesRemovedFromWinner).toBe(0);

    const calls = getTxCalls();
    expect(
      findCalls(calls, "DELETE FROM episode_canonical_topics"),
    ).toHaveLength(0);
  });

  it("(9) unmerge of non-merged topic throws not-merged", async () => {
    setTxFixtures([
      {
        match: /SELECT status, merged_into_id FROM canonical_topics/,
        rows: [{ status: "active", merged_into_id: null }],
      },
    ]);

    const { unmergeCanonicals } = await import("@/trigger/helpers/database");
    await expect(
      unmergeCanonicals({
        loserId: 3,
        episodeIdsToReassign: [],
        actor: "user_h",
      }),
    ).rejects.toThrow("not-merged");
  });

  it("(9b) unmerge of missing topic throws not-merged", async () => {
    setTxFixtures([
      {
        match: /SELECT status, merged_into_id FROM canonical_topics/,
        rows: [],
      },
    ]);

    const { unmergeCanonicals } = await import("@/trigger/helpers/database");
    await expect(
      unmergeCanonicals({
        loserId: 99,
        episodeIdsToReassign: [],
        actor: "user_i",
      }),
    ).rejects.toThrow("not-merged");
  });

  it("(9c) unmerge throws not-merged when merged_into_id changes between probe and lock (race window)", async () => {
    setTxFixtures([
      // Probe sees winner=9
      {
        match: /SELECT status, merged_into_id FROM canonical_topics/,
        rows: [{ status: "merged", merged_into_id: 9 }],
      },
      { match: "pg_advisory_xact_lock", rows: [] },
      // After advisory lock, FOR UPDATE re-read shows winner=11 (concurrent re-merge)
      {
        match: "FOR UPDATE",
        rows: [{ id: 5, status: "merged", merged_into_id: 11 }],
      },
    ]);

    const { unmergeCanonicals } = await import("@/trigger/helpers/database");
    await expect(
      unmergeCanonicals({
        loserId: 5,
        episodeIdsToReassign: [],
        actor: "user_race",
      }),
    ).rejects.toThrow("not-merged");
  });

  it("(10) unmerge lock ordering: probe → advisory lock → SELECT FOR UPDATE (matches mergeCanonicals to avoid deadlock)", async () => {
    setTxFixtures([
      {
        match: /SELECT status, merged_into_id FROM canonical_topics/,
        rows: [{ status: "merged", merged_into_id: 9 }],
      },
      { match: "pg_advisory_xact_lock", rows: [] },
      {
        match: "FOR UPDATE",
        rows: [{ id: 5, status: "merged", merged_into_id: 9 }],
      },
      { match: "SET status = 'active'", rows: [{ id: 5 }] },
      { match: "INSERT INTO episode_canonical_topics", rows: [{ id: 100 }] },
      { match: "DELETE FROM episode_canonical_topics", rows: [] },
      { match: "canonical_topic_admin_log", rows: [{ id: 12 }] },
    ]);

    const { unmergeCanonicals } = await import("@/trigger/helpers/database");
    await unmergeCanonicals({
      loserId: 5,
      episodeIdsToReassign: [77],
      actor: "user_j",
    });

    const calls = getTxCalls();
    const probeIdx = calls.findIndex(
      (c) =>
        c.sql.toLowerCase().includes("select status, merged_into_id") &&
        !c.sql.toLowerCase().includes("for update"),
    );
    const lockIdx = calls.findIndex((c) =>
      c.sql.toLowerCase().includes("pg_advisory_xact_lock"),
    );
    const forUpdateIdx = calls.findIndex((c) =>
      c.sql.toLowerCase().includes("for update"),
    );
    expect(probeIdx).toBeGreaterThanOrEqual(0);
    expect(lockIdx).toBeGreaterThanOrEqual(0);
    expect(forUpdateIdx).toBeGreaterThanOrEqual(0);
    expect(probeIdx).toBeLessThan(lockIdx);
    expect(lockIdx).toBeLessThan(forUpdateIdx);
  });

  it("(11-unmerge) audit log metadata captures episode_ids and also_removed_from_winner", async () => {
    setTxFixtures([
      {
        match: /SELECT status, merged_into_id FROM canonical_topics/,
        rows: [{ status: "merged", merged_into_id: 9 }],
      },
      { match: "pg_advisory_xact_lock", rows: [] },
      {
        match: "FOR UPDATE",
        rows: [{ id: 5, status: "merged", merged_into_id: 9 }],
      },
      { match: "SET status = 'active'", rows: [{ id: 5 }] },
      {
        match: "INSERT INTO episode_canonical_topics",
        rows: [{ id: 100 }, { id: 101 }],
      },
      { match: "DELETE FROM episode_canonical_topics", rows: [] },
      { match: "canonical_topic_admin_log", rows: [{ id: 13 }] },
    ]);

    const { unmergeCanonicals } = await import("@/trigger/helpers/database");
    await unmergeCanonicals({
      loserId: 5,
      episodeIdsToReassign: [88, 99],
      actor: "user_k",
      alsoRemoveFromWinner: true,
    });

    const auditCall = findCalls(getTxCalls(), "canonical_topic_admin_log")[0];
    const metadataParam = auditCall?.params.find(
      (p) => typeof p === "string" && p.includes("episode_ids"),
    );
    expect(metadataParam).toBeDefined();
    const meta = JSON.parse(metadataParam as string) as Record<string, unknown>;
    expect(meta.episode_ids).toEqual([88, 99]);
    expect(meta.also_removed_from_winner).toBe(true);
  });

  it("(12-unmerge) reassigns episodes via single set-based INSERT (regression guard against N+1 loop)", async () => {
    setTxFixtures([
      {
        match: /SELECT status, merged_into_id FROM canonical_topics/,
        rows: [{ status: "merged", merged_into_id: 9 }],
      },
      { match: "pg_advisory_xact_lock", rows: [] },
      {
        match: "FOR UPDATE",
        rows: [{ id: 5, status: "merged", merged_into_id: 9 }],
      },
      { match: "SET status = 'active'", rows: [{ id: 5 }] },
      {
        match: "INSERT INTO episode_canonical_topics",
        rows: [{ id: 200 }, { id: 201 }, { id: 202 }],
      },
      { match: "DELETE FROM episode_canonical_topics", rows: [] },
      { match: "canonical_topic_admin_log", rows: [{ id: 14 }] },
    ]);

    const { unmergeCanonicals } = await import("@/trigger/helpers/database");
    const result = await unmergeCanonicals({
      loserId: 5,
      episodeIdsToReassign: [77, 88, 99],
      actor: "user_l",
    });

    expect(result.episodesReassigned).toBe(3);
    expect(result.episodesSkipped).toBe(0);

    const inserts = findCalls(
      getTxCalls(),
      "INSERT INTO episode_canonical_topics",
    );
    expect(inserts).toHaveLength(1);
  });
});
