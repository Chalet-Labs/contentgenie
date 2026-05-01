// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResolveTopicInput } from "@/lib/entity-resolution";
import { EXACT_MATCH_SIMILARITY } from "@/lib/entity-resolution-constants";
import {
  type RecordedCall,
  getTxLog,
  resetTxState,
  serializeSql,
  setTxFixtures,
  txCallLog,
} from "@/test/sql-fixture-queue";
import { buildEmbedding } from "@/test/embeddings";

// Test-file-local recording tx used by step-counter custom mocks (e.g. the
// "recovery exact-lookup" case below). Pushes its recorded-call array into
// the shared `txCallLog` so the test can introspect via `getTxLog(0)`.
type ResolveRows = (sqlText: string, params: unknown[]) => unknown[];
function createRecordingTx(resolveRows: ResolveRows): {
  execute: (sqlObj: unknown) => Promise<{ rows: unknown[] }>;
} {
  const recorded: RecordedCall[] = [];
  txCallLog.push(recorded);
  return {
    execute: async (sqlObj: unknown) => {
      const { sqlText, params } = serializeSql(sqlObj);
      recorded.push({ sql: sqlText, params });
      return { rows: resolveRows(sqlText, params) };
    },
  };
}

// ---- Transactional mock (delegates to shared fixture-queue harness) ---------

vi.mock("@/db/pool", async () => {
  const { createTransactionalFixtureMock } =
    await import("@/test/sql-fixture-queue");
  return { transactional: createTransactionalFixtureMock() };
});

// These modules are not used by the new helpers but are imported transitively
// through database.ts — stub them to prevent side-effect errors.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({
  episodes: {},
  episodeTopics: {},
  podcasts: {},
}));
vi.mock("@/db/helpers", () => ({ upsertPodcast: vi.fn() }));
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual, eq: vi.fn() };
});

// ---- Helpers -----------------------------------------------------------------

function makeInput(
  overrides: Partial<ResolveTopicInput> = {},
): ResolveTopicInput {
  return {
    label: "Rust 2024 Edition",
    kind: "release",
    summary: "Rust 2024 edition ships.",
    aliases: ["Rust 2024"],
    ongoing: false,
    relevance: 0.85,
    coverageScore: 0.7,
    episodeId: 999,
    identityEmbedding: buildEmbedding(),
    contextEmbedding: buildEmbedding(),
    ...overrides,
  };
}

function findCalls(haystack: RecordedCall[], needle: string): RecordedCall[] {
  return haystack.filter((c) => c.sql.includes(needle));
}

// ---- Tests -------------------------------------------------------------------

beforeEach(() => {
  resetTxState();
});

afterEach(() => {
  resetTxState();
  vi.restoreAllMocks();
});

describe("forceInsertNewCanonical", () => {
  it("acquires advisory lock with the same JSON.stringify([normalizeLabel(label), kind]) key", async () => {
    const input = makeInput();
    // Single tx: exact-lookup miss → insert succeeds → junction write
    setTxFixtures([
      { match: "canonical_topics WHERE lower(normalized_label)", rows: [] },
      { match: "INSERT INTO canonical_topics", rows: [{ id: 77 }] },
    ]);

    const { forceInsertNewCanonical } =
      await import("@/trigger/helpers/database");
    await forceInsertNewCanonical(input);

    const calls = getTxLog(0);
    const lockCalls = findCalls(calls, "pg_advisory_xact_lock");
    expect(lockCalls).toHaveLength(1);
    // The lock key must be JSON.stringify([normalizeLabel(label), kind])
    const lockParam = lockCalls[0].params.find(
      (p) => typeof p === "string" && p.includes("rust 2024 edition"),
    );
    expect(lockParam).toBeDefined();
    const parsed = JSON.parse(lockParam as string) as [string, string];
    expect(parsed[0]).toBe("rust 2024 edition");
    expect(parsed[1]).toBe("release");
  });

  it("returns auto match when exact-lookup hits before insert (race deference)", async () => {
    const input = makeInput();
    // exact-lookup returns existing row → no insert
    setTxFixtures([
      {
        match: "canonical_topics WHERE lower(normalized_label)",
        rows: [{ id: 55, kind: "release" }],
      },
    ]);

    const { forceInsertNewCanonical } =
      await import("@/trigger/helpers/database");
    const result = await forceInsertNewCanonical(input);

    expect(result.matchMethod).toBe("auto");
    expect(result.similarityToTopMatch).toBe(EXACT_MATCH_SIMILARITY);
    expect(result.canonicalId).toBe(55);
    // Must NOT run a kNN (<=> operator)
    const calls = getTxLog(0);
    const knnCalls = findCalls(calls, "<=>");
    expect(knnCalls).toHaveLength(0);
    expect(findCalls(calls, "INSERT INTO canonical_topics")).toHaveLength(0);
  });

  it("inserts new canonical and writes junction with match_method='new' on exact-lookup miss", async () => {
    const input = makeInput({ aliases: [] });
    // exact-lookup miss → insert succeeds
    setTxFixtures([
      { match: "canonical_topics WHERE lower(normalized_label)", rows: [] },
      { match: "INSERT INTO canonical_topics", rows: [{ id: 88 }] },
    ]);

    const { forceInsertNewCanonical } =
      await import("@/trigger/helpers/database");
    const result = await forceInsertNewCanonical(input);

    expect(result.matchMethod).toBe("new");
    expect(result.similarityToTopMatch).toBeNull();
    expect(result.canonicalId).toBe(88);
    expect(result.versionTokenForcedDisambig).toBe(false);
    expect(result.candidatesConsidered).toBe(0);

    const calls = getTxLog(0);
    const junctionCalls = findCalls(calls, "episode_canonical_topics");
    expect(junctionCalls.length).toBeGreaterThan(0);
    const junctionCall = junctionCalls[0];
    expect(junctionCall.params).toContain("new");
  });

  it("uses recovery exact-lookup (not kNN) when insert returns 0 rows", async () => {
    const input = makeInput({ aliases: [] });

    // The fixture system can't distinguish 1st vs 2nd call to the same SQL
    // pattern. Use a step-counter custom mock (same pattern as entity-resolution.test.ts
    // test (19)).
    const { transactional } = await import("@/db/pool");
    const transactionalMock = vi.mocked(transactional);
    transactionalMock.mockImplementationOnce(async (fn) => {
      let exactLookupCalls = 0;
      const tx = createRecordingTx((sqlText) => {
        if (sqlText.includes("lower(normalized_label)")) {
          exactLookupCalls += 1;
          if (exactLookupCalls === 1) return []; // initial miss
          return [{ id: 66, kind: "release" }]; // recovery hit
        }
        if (
          sqlText.includes("INSERT INTO canonical_topics") &&
          !sqlText.includes("alias")
        ) {
          return []; // simulate race → 0 rows
        }
        // last_seen update, junction write, etc.
        return [];
      });
      return fn(tx as never);
    });

    const { forceInsertNewCanonical } =
      await import("@/trigger/helpers/database");
    const result = await forceInsertNewCanonical(input);

    expect(result.matchMethod).toBe("auto");
    expect(result.canonicalId).toBe(66);

    // Must not run kNN at any point
    const calls = getTxLog(0);
    const knnCalls = findCalls(calls, "<=>");
    expect(knnCalls).toHaveLength(0);
    // Two exact-lookups: initial + recovery
    expect(findCalls(calls, "lower(normalized_label)")).toHaveLength(2);
  });

  it("throws EntityResolutionError('invalid_embedding_dim') for wrong-dim identity embedding", async () => {
    const input = makeInput({ identityEmbedding: [0.1, 0.2] });

    const { forceInsertNewCanonical } =
      await import("@/trigger/helpers/database");
    await expect(forceInsertNewCanonical(input)).rejects.toMatchObject({
      reason: "invalid_embedding_dim",
    });
  });

  it("throws EntityResolutionError('invalid_embedding_dim') for wrong-dim context embedding", async () => {
    const input = makeInput({ contextEmbedding: [0.1] });

    const { forceInsertNewCanonical } =
      await import("@/trigger/helpers/database");
    await expect(forceInsertNewCanonical(input)).rejects.toMatchObject({
      reason: "invalid_embedding_dim",
    });
  });

  it("throws EntityResolutionError('invalid_embedding_value') for non-finite values", async () => {
    const embedding = buildEmbedding();
    embedding[0] = Infinity;
    const input = makeInput({ identityEmbedding: embedding });

    const { forceInsertNewCanonical } =
      await import("@/trigger/helpers/database");
    await expect(forceInsertNewCanonical(input)).rejects.toMatchObject({
      reason: "invalid_embedding_value",
    });
  });

  it("throws EntityResolutionError('other_below_relevance_floor') when kind='other' and relevance below floor", async () => {
    const input = makeInput({ kind: "other", relevance: 0.3 });

    const { forceInsertNewCanonical } =
      await import("@/trigger/helpers/database");
    await expect(forceInsertNewCanonical(input)).rejects.toMatchObject({
      reason: "other_below_relevance_floor",
    });
    expect(txCallLog).toHaveLength(0);
  });

  it("inserts aliases into canonical_topic_aliases after canonical is minted", async () => {
    const input = makeInput({ aliases: ["Rust 2024", "Edition 2024"] });
    setTxFixtures([
      { match: "canonical_topics WHERE lower(normalized_label)", rows: [] },
      { match: "INSERT INTO canonical_topics", rows: [{ id: 99 }] },
    ]);

    const { forceInsertNewCanonical } =
      await import("@/trigger/helpers/database");
    const result = await forceInsertNewCanonical(input);

    expect(result.canonicalId).toBe(99);
    const calls = getTxLog(0);
    const aliasCalls = findCalls(calls, "canonical_topic_aliases");
    expect(aliasCalls.length).toBeGreaterThan(0);
  });
});

describe("addAliasIfNew", () => {
  it("returns true when alias row is inserted", async () => {
    setTxFixtures([{ match: "canonical_topic_aliases", rows: [{ id: 10 }] }]);

    const { addAliasIfNew } = await import("@/trigger/helpers/database");
    const result = await addAliasIfNew(42, "some alias");

    expect(result).toBe(true);
  });

  it("returns false on conflict (ON CONFLICT DO NOTHING → 0 rows)", async () => {
    setTxFixtures([{ match: "canonical_topic_aliases", rows: [] }]);

    const { addAliasIfNew } = await import("@/trigger/helpers/database");
    const result = await addAliasIfNew(42, "duplicate alias");

    expect(result).toBe(false);
  });

  it("returns false for blank alias without opening a transaction", async () => {
    const { addAliasIfNew } = await import("@/trigger/helpers/database");
    const result = await addAliasIfNew(42, "   ");

    expect(result).toBe(false);
    // No tx should have been opened
    expect(txCallLog).toHaveLength(0);
  });
});
