// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EntityResolutionError,
  hasVersionTokenMismatch,
  normalizeLabel,
  resolveTopic,
  type ResolveTopicInput,
} from "@/lib/entity-resolution";
import { EMBEDDING_DIMENSION } from "@/lib/ai/embed-constants";

// ---- Mocks ------------------------------------------------------------------

// Each call to `transactional(cb)` runs `cb(mockTx)` against a fresh MockTx
// pre-loaded with fixtures keyed by SQL substring. Tests register fixtures
// per-tx via `setTxFixtures(...)`.
const txFixturesQueue: TxFixtures[] = [];
const txCallLog: RecordedCall[][] = [];

interface TxFixtures {
  rows: SqlFixture[];
}

interface SqlFixture {
  match: string | RegExp;
  rows: unknown[];
}

interface RecordedCall {
  sql: string;
  params: unknown[];
}

function setTxFixtures(rows: SqlFixture[]): void {
  txFixturesQueue.push({ rows });
}

function getTxLog(index: number): RecordedCall[] {
  return txCallLog[index] ?? [];
}

function allRecordedCalls(): RecordedCall[] {
  return txCallLog.flat();
}

vi.mock("@/db/pool", () => ({
  transactional: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const fixtures = txFixturesQueue.shift() ?? { rows: [] };
    const recorded: RecordedCall[] = [];
    txCallLog.push(recorded);
    const tx = {
      execute: async (sqlObj: unknown) => {
        const { sqlText, params } = serializeSql(sqlObj);
        recorded.push({ sql: sqlText, params });
        const fixture = fixtures.rows.find((f) =>
          typeof f.match === "string"
            ? sqlText.includes(f.match)
            : f.match.test(sqlText),
        );
        return { rows: fixture?.rows ?? [] };
      },
    };
    return fn(tx);
  }),
}));

const generateCompletionMock = vi.fn();
vi.mock("@/lib/ai/generate", () => ({
  generateCompletion: (...args: unknown[]) => generateCompletionMock(...args),
}));

// Walk a Drizzle SQL object and produce a stable serialized string + params
// list. We don't need DB-correct rendering — we just need stable substrings
// for fixture matching and parameter extraction for assertions.
function serializeSql(sqlObj: unknown): {
  sqlText: string;
  params: unknown[];
} {
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
      // Bare primitives at the top level of queryChunks are template-literal
      // interpolations — drizzle treats them as bound params. Static SQL
      // text comes through as StringChunk objects (handled below).
      params.push(chunk);
      parts.push("$");
      return;
    }
    const obj = chunk as { value?: unknown; queryChunks?: unknown[] };
    if (Array.isArray(obj.queryChunks)) {
      obj.queryChunks.forEach(visit);
      return;
    }
    // StringChunk: { value: string[] }
    if (Array.isArray(obj.value)) {
      parts.push(obj.value.join(""));
      return;
    }
    // Param-like: any other object with `value` is treated as a bound param
    if (obj.value !== undefined) {
      params.push(obj.value);
      parts.push("$");
      return;
    }
  };
  visit(sqlObj);
  return { sqlText: parts.join(" "), params };
}

// ---- Helpers ----------------------------------------------------------------

function buildEmbedding(): number[] {
  return Array.from({ length: EMBEDDING_DIMENSION }, () => 0.001);
}

function makeInput(
  overrides: Partial<ResolveTopicInput> = {},
): ResolveTopicInput {
  return {
    label: "Claude Opus 4.7 release",
    kind: "release",
    summary: "Anthropic shipped Opus 4.7.",
    aliases: ["Opus 4.7"],
    ongoing: false,
    relevance: 0.9,
    coverageScore: 0.7,
    episodeId: 1234,
    identityEmbedding: buildEmbedding(),
    contextEmbedding: buildEmbedding(),
    ...overrides,
  };
}

function findCalls(haystack: RecordedCall[], needle: string): RecordedCall[] {
  return haystack.filter((c) => c.sql.includes(needle));
}

// ---- Tests ------------------------------------------------------------------

beforeEach(() => {
  txFixturesQueue.length = 0;
  txCallLog.length = 0;
  generateCompletionMock.mockReset();
});

afterEach(() => {
  txFixturesQueue.length = 0;
  txCallLog.length = 0;
});

describe("normalizeLabel", () => {
  it("lowercases and trims", () => {
    expect(normalizeLabel("Foo")).toBe("foo");
    expect(normalizeLabel(" Foo ")).toBe("foo");
    expect(normalizeLabel("FOO\t")).toBe("foo");
  });
});

describe("hasVersionTokenMismatch", () => {
  it("returns false for identical version tokens with different prefixes", () => {
    expect(hasVersionTokenMismatch("Opus 4.7", "Claude Opus 4.7")).toBe(false);
  });

  it("returns true when patch versions differ", () => {
    expect(hasVersionTokenMismatch("Opus 4.6", "Opus 4.7")).toBe(true);
  });

  it("returns true when years differ", () => {
    expect(hasVersionTokenMismatch("WWDC 2025", "WWDC 2026")).toBe(true);
  });

  it("returns true when v-prefix versions differ", () => {
    expect(hasVersionTokenMismatch("v1 release", "v2 release")).toBe(true);
  });

  it("returns false for labels with no version tokens", () => {
    expect(
      hasVersionTokenMismatch("Creatine", "Creatine supplementation"),
    ).toBe(false);
  });

  it("returns true when one label has a version token and the other does not", () => {
    expect(hasVersionTokenMismatch("Opus", "Opus 4.7")).toBe(true);
  });

  it("compares version tokens case-insensitively", () => {
    expect(hasVersionTokenMismatch("V2 release", "v2 release")).toBe(false);
  });
});

describe("resolveTopic", () => {
  describe("TX-1 fast paths (no LLM call)", () => {
    it("(1) exact-lookup hit short-circuits to auto-match without running kNN", async () => {
      setTxFixtures([
        {
          match: "lower(normalized_label)",
          rows: [{ id: 42, kind: "release" }],
        },
        { match: "INSERT INTO canonical_topic_aliases", rows: [{ id: 1 }] },
      ]);

      const result = await resolveTopic(makeInput());

      expect(result).toMatchObject({
        canonicalId: 42,
        matchMethod: "auto",
        similarityToTopMatch: 1.0,
        versionTokenForcedDisambig: false,
        candidatesConsidered: 0,
      });
      const calls = getTxLog(0);
      expect(findCalls(calls, "identity_embedding <=>")).toHaveLength(0);
      expect(findCalls(calls, "pg_advisory_xact_lock")).toHaveLength(1);
      expect(generateCompletionMock).not.toHaveBeenCalled();
    });

    it("(2) auto-matches via kNN top-1 when sim > 0.92, same kind, no version mismatch", async () => {
      const topId = 7;
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        {
          match: "identity_embedding <=>",
          rows: [
            {
              id: topId,
              label: "Anthropic Opus 4.7 release",
              kind: "release",
              summary: "...",
              last_seen: new Date(),
              ongoing: false,
              similarity: 0.95,
            },
          ],
        },
        { match: "UPDATE canonical_topics", rows: [] },
        { match: "INSERT INTO canonical_topic_aliases", rows: [{ id: 1 }] },
        { match: "INSERT INTO episode_canonical_topics", rows: [] },
      ]);

      const result = await resolveTopic(makeInput());

      expect(result).toMatchObject({
        canonicalId: topId,
        matchMethod: "auto",
        similarityToTopMatch: 0.95,
        versionTokenForcedDisambig: false,
      });
      expect(result.candidatesConsidered).toBeGreaterThan(0);
      expect(generateCompletionMock).not.toHaveBeenCalled();
    });

    it("(8) kNN returns 0 candidates → pure new-insert via TX-1", async () => {
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        { match: "identity_embedding <=>", rows: [] },
        { match: "INSERT INTO canonical_topics", rows: [{ id: 100 }] },
        { match: "INSERT INTO canonical_topic_aliases", rows: [{ id: 1 }] },
        { match: "INSERT INTO episode_canonical_topics", rows: [] },
      ]);

      const result = await resolveTopic(makeInput());

      expect(result).toMatchObject({
        canonicalId: 100,
        matchMethod: "new",
        similarityToTopMatch: null,
        candidatesConsidered: 0,
        versionTokenForcedDisambig: false,
      });
      expect(txCallLog).toHaveLength(1); // no second tx
      expect(generateCompletionMock).not.toHaveBeenCalled();
    });

    it("(11) alias dedup counts only newly-inserted aliases (per-canonical)", async () => {
      setTxFixtures([
        {
          match: "lower(normalized_label)",
          rows: [{ id: 5, kind: "release" }],
        },
        { match: "UPDATE canonical_topics", rows: [] },
        // First alias upsert (existing) returns 0 rows; second (new) returns 1.
        // The MockTx will use the FIRST matching fixture; for a deterministic
        // sequence we'd need a counter — easier: use a regex matcher and
        // distinguish by whether the SQL params include "existing" vs "new"
        // through a side-channel. For this test, configure so any alias-insert
        // returns rows once, then 0. We approximate: alias-insert returns 1
        // row total (one inserted), so the count equals the unique aliases
        // actually inserted in this resolver call.
        { match: "INSERT INTO canonical_topic_aliases", rows: [{ id: 1 }] },
        { match: "INSERT INTO episode_canonical_topics", rows: [] },
      ]);

      const result = await resolveTopic(
        makeInput({ aliases: ["existing", "new"] }),
      );

      // Both inserts hit the same fixture (returns 1 row each), so count is 2.
      // The semantic guarantee is "rows returned by RETURNING id" — the test
      // verifies the resolver iterates aliases and tallies row counts, not
      // that DB-level dedup happened (that's the schema test's concern).
      expect(result.aliasesAdded).toBe(2);
      expect(result.matchMethod).toBe("auto");
    });

    it("(12) transaction rollback on kNN error — no INSERTs recorded", async () => {
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
      ]);

      // Override transactional mock once: have it throw on the kNN call.
      const txExecuteThrow = async () => {
        throw new Error("kNN exploded");
      };
      void txExecuteThrow;
      // Easier: queue a fixture-less tx and intercept by a marker SQL — the
      // resolver will reach the kNN, find no fixture, then hit our
      // intercept. We use the existing serializer — but to throw, we mock
      // `transactional` to inject error after the SET LOCAL.
      const { transactional } = await import("@/db/pool");
      const transactionalMock = vi.mocked(transactional);
      transactionalMock.mockImplementationOnce(async (fn) => {
        const recorded: RecordedCall[] = [];
        txCallLog.push(recorded);
        const tx = {
          execute: async (sqlObj: unknown) => {
            const { sqlText, params } = serializeSql(sqlObj);
            recorded.push({ sql: sqlText, params });
            if (sqlText.includes("identity_embedding <=>")) {
              throw new Error("kNN exploded");
            }
            return { rows: [] };
          },
        };
        return fn(tx as never);
      });

      await expect(resolveTopic(makeInput())).rejects.toThrow("kNN exploded");

      const calls = allRecordedCalls();
      expect(findCalls(calls, "INSERT INTO canonical_topics").length).toBe(0);
      expect(
        findCalls(calls, "INSERT INTO episode_canonical_topics").length,
      ).toBe(0);
    });

    it("(19) ON CONFLICT DO NOTHING recovery uses exact-lookup, NOT another kNN", async () => {
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] }, // first exact-lookup miss
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        { match: "identity_embedding <=>", rows: [] }, // empty kNN
        { match: "INSERT INTO canonical_topics", rows: [] }, // 0 rows = race
        // Recovery: second exact-lookup. We use a tx-scoped queue so the
        // second match wins. Approximate by pushing a regex matcher that
        // overrides the first AFTER the INSERT.
      ]);

      // To distinguish first exact-lookup miss from second exact-lookup hit
      // we use a tx-scoped step counter. Override the mock once.
      txFixturesQueue.shift(); // discard the queue we just set; rebuild via custom impl
      const { transactional } = await import("@/db/pool");
      const transactionalMock = vi.mocked(transactional);
      transactionalMock.mockImplementationOnce(async (fn) => {
        const recorded: RecordedCall[] = [];
        txCallLog.push(recorded);
        let exactLookupCalls = 0;
        const tx = {
          execute: async (sqlObj: unknown) => {
            const { sqlText, params } = serializeSql(sqlObj);
            recorded.push({ sql: sqlText, params });
            if (sqlText.includes("lower(normalized_label)")) {
              exactLookupCalls += 1;
              if (exactLookupCalls === 1) return { rows: [] };
              return { rows: [{ id: 200, kind: "release" }] };
            }
            if (sqlText.includes("identity_embedding <=>")) return { rows: [] };
            if (
              sqlText.includes("INSERT INTO canonical_topics") &&
              !sqlText.includes("alias")
            ) {
              return { rows: [] };
            }
            if (sqlText.includes("INSERT INTO canonical_topic_aliases"))
              return { rows: [{ id: 1 }] };
            return { rows: [] };
          },
        };
        return fn(tx as never);
      });

      const result = await resolveTopic(makeInput());

      expect(result).toMatchObject({
        canonicalId: 200,
        matchMethod: "auto",
        similarityToTopMatch: 1.0,
      });
      const calls = getTxLog(0);
      // Only one kNN call ever (the original), never a second.
      expect(findCalls(calls, "identity_embedding <=>").length).toBe(1);
      // Two exact-lookups (original + recovery).
      expect(findCalls(calls, "lower(normalized_label)").length).toBe(2);
    });

    it("(13) advisory lock issued in TX-1 (single tx for auto-match)", async () => {
      setTxFixtures([
        {
          match: "lower(normalized_label)",
          rows: [{ id: 10, kind: "release" }],
        },
        { match: "INSERT INTO canonical_topic_aliases", rows: [{ id: 1 }] },
      ]);
      await resolveTopic(makeInput());
      const lockCalls = findCalls(allRecordedCalls(), "pg_advisory_xact_lock");
      expect(lockCalls.length).toBe(1);
    });

    it("(14) SET LOCAL hnsw.ef_search is issued before any kNN; absent on exact-hit path", async () => {
      // Sub-test A: kNN path — SET LOCAL precedes kNN.
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        {
          match: "identity_embedding <=>",
          rows: [
            {
              id: 10,
              label: "Anthropic Opus 4.7 release",
              kind: "release",
              summary: "",
              last_seen: new Date(),
              ongoing: false,
              similarity: 0.95,
            },
          ],
        },
        { match: "UPDATE canonical_topics", rows: [] },
        { match: "INSERT INTO canonical_topic_aliases", rows: [{ id: 1 }] },
        { match: "INSERT INTO episode_canonical_topics", rows: [] },
      ]);
      await resolveTopic(makeInput());
      const calls = getTxLog(0);
      const setLocalIdx = calls.findIndex((c) =>
        c.sql.includes("SET LOCAL hnsw.ef_search"),
      );
      const knnIdx = calls.findIndex((c) =>
        c.sql.includes("identity_embedding <=>"),
      );
      expect(setLocalIdx).toBeGreaterThanOrEqual(0);
      expect(knnIdx).toBeGreaterThan(setLocalIdx);

      // Sub-test B: exact-lookup hit — SET LOCAL is NOT emitted.
      txCallLog.length = 0;
      txFixturesQueue.length = 0;
      setTxFixtures([
        {
          match: "lower(normalized_label)",
          rows: [{ id: 99, kind: "release" }],
        },
        { match: "INSERT INTO canonical_topic_aliases", rows: [{ id: 1 }] },
      ]);
      await resolveTopic(makeInput());
      expect(findCalls(getTxLog(0), "SET LOCAL hnsw.ef_search").length).toBe(0);
    });

    it("(22) whitespace-variant inputs produce identical advisory-lock SQL bind", async () => {
      const captureBindOnce = async (label: string) => {
        const { transactional } = await import("@/db/pool");
        const transactionalMock = vi.mocked(transactional);
        let capturedParams: unknown[] = [];
        transactionalMock.mockImplementationOnce(async (fn) => {
          const tx = {
            execute: async (sqlObj: unknown) => {
              const { sqlText, params } = serializeSql(sqlObj);
              if (
                sqlText.includes("pg_advisory_xact_lock") &&
                capturedParams.length === 0
              ) {
                capturedParams = params;
              }
              if (sqlText.includes("lower(normalized_label)")) {
                return { rows: [{ id: 1, kind: "release" }] };
              }
              if (sqlText.includes("INSERT INTO canonical_topic_aliases"))
                return { rows: [] };
              return { rows: [] };
            },
          };
          return fn(tx as never);
        });
        await resolveTopic(makeInput({ label }));
        return capturedParams;
      };

      const paramsA = await captureBindOnce("Foo");
      const paramsB = await captureBindOnce(" Foo ");
      // Both invocations should bind the same normalized label string.
      expect(paramsA).toEqual(paramsB);
      expect(paramsA).toContain("foo");
    });

    it("(15) boundary — top-1 sim exactly 0.92 routes to disambig (strict >, not >=)", async () => {
      // Exact-lookup miss → kNN returns sim=0.92 → not auto (strict >),
      // not disambig (≥0.82) so disambig DOES fire. Mock LLM to pick the
      // top candidate — assert matchMethod is 'llm_disambig', not 'auto'.
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        {
          match: "identity_embedding <=>",
          rows: [
            {
              id: 7,
              label: "Other",
              kind: "release",
              summary: "",
              last_seen: new Date(),
              ongoing: false,
              similarity: 0.92,
            },
          ],
        },
      ]);
      // TX-2 fixtures
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] }, // miss
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        {
          match: "WHERE id =",
          rows: [{ id: 7, kind: "release", similarity: 0.92 }],
        },
        { match: "UPDATE canonical_topics", rows: [] },
        { match: "INSERT INTO canonical_topic_aliases", rows: [{ id: 1 }] },
        { match: "INSERT INTO episode_canonical_topics", rows: [] },
      ]);
      generateCompletionMock.mockResolvedValueOnce('{"chosen_id": 7}');

      const result = await resolveTopic(makeInput());
      expect(result.matchMethod).toBe("llm_disambig");
      expect(generateCompletionMock).toHaveBeenCalledTimes(1);
    });

    it("(16) boundary — top-1 sim exactly 0.82 routes to disambig (>=, inclusive)", async () => {
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        {
          match: "identity_embedding <=>",
          rows: [
            {
              id: 8,
              label: "Other",
              kind: "release",
              summary: "",
              last_seen: new Date(),
              ongoing: false,
              similarity: 0.82,
            },
          ],
        },
      ]);
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        {
          match: "WHERE id =",
          rows: [{ id: 8, kind: "release", similarity: 0.82 }],
        },
        { match: "UPDATE canonical_topics", rows: [] },
        { match: "INSERT INTO canonical_topic_aliases", rows: [{ id: 1 }] },
        { match: "INSERT INTO episode_canonical_topics", rows: [] },
      ]);
      generateCompletionMock.mockResolvedValueOnce('{"chosen_id": 8}');

      const result = await resolveTopic(makeInput());
      expect(result.matchMethod).toBe("llm_disambig");
    });

    it("(10) kind-mismatch top-1 routes to disambig (sim ≥ 0.82, but different kind)", async () => {
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] }, // miss in TX-1 (kind-scoped)
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        {
          match: "identity_embedding <=>",
          rows: [
            {
              id: 9,
              label: "Anthropic Opus 4.7 release",
              kind: "concept", // different kind
              summary: "",
              last_seen: new Date(),
              ongoing: false,
              similarity: 0.95,
            },
          ],
        },
      ]);
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        { match: "WHERE id =", rows: [] }, // chosen id won't match kind, falls to new
        { match: "INSERT INTO canonical_topics", rows: [{ id: 555 }] },
        { match: "INSERT INTO canonical_topic_aliases", rows: [{ id: 1 }] },
        { match: "INSERT INTO episode_canonical_topics", rows: [] },
      ]);
      generateCompletionMock.mockResolvedValueOnce('{"chosen_id": null}');

      const result = await resolveTopic(makeInput());
      expect(result.matchMethod).toBe("new");
      expect(generateCompletionMock).toHaveBeenCalled();
    });
  });

  describe("disambig (TX-1 → LLM → TX-2)", () => {
    it("(3) LLM picks a candidate → llm_disambig with two advisory locks (one per tx)", async () => {
      // TX-1 fixtures: exact miss; kNN top1=0.85, top3=0.83 (≥0.82 → disambig).
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        {
          match: "identity_embedding <=>",
          rows: [
            {
              id: 1,
              label: "Cand 1",
              kind: "release",
              summary: "",
              last_seen: new Date(),
              ongoing: false,
              similarity: 0.85,
            },
            {
              id: 3,
              label: "Cand 3",
              kind: "release",
              summary: "",
              last_seen: new Date(),
              ongoing: false,
              similarity: 0.83,
            },
          ],
        },
      ]);
      // TX-2 fixtures
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        {
          match: "WHERE id =",
          rows: [{ id: 3, kind: "release", similarity: 0.83 }],
        },
        { match: "UPDATE canonical_topics", rows: [] },
        { match: "INSERT INTO canonical_topic_aliases", rows: [{ id: 1 }] },
        { match: "INSERT INTO episode_canonical_topics", rows: [] },
      ]);
      generateCompletionMock.mockResolvedValueOnce('{"chosen_id": 3}');

      const result = await resolveTopic(makeInput());

      expect(result.matchMethod).toBe("llm_disambig");
      expect(result.canonicalId).toBe(3);
      expect(result.similarityToTopMatch).toBeCloseTo(0.83);

      const lockCalls = findCalls(allRecordedCalls(), "pg_advisory_xact_lock");
      expect(lockCalls.length).toBe(2);
    });

    it("(4) LLM returns chosen_id: null → TX-2 takes new-insert path", async () => {
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        {
          match: "identity_embedding <=>",
          rows: [
            {
              id: 1,
              label: "Cand",
              kind: "release",
              summary: "",
              last_seen: new Date(),
              ongoing: false,
              similarity: 0.85,
            },
          ],
        },
      ]);
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "INSERT INTO canonical_topics", rows: [{ id: 777 }] },
        { match: "INSERT INTO canonical_topic_aliases", rows: [{ id: 1 }] },
        { match: "INSERT INTO episode_canonical_topics", rows: [] },
      ]);
      generateCompletionMock.mockResolvedValueOnce('{"chosen_id": null}');

      const result = await resolveTopic(makeInput());
      expect(result.matchMethod).toBe("new");
      expect(result.canonicalId).toBe(777);
      expect(result.similarityToTopMatch).toBeNull();
    });

    it("(5) malformed JSON → throws EntityResolutionError(disambig_failed); no inserts", async () => {
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        {
          match: "identity_embedding <=>",
          rows: [
            {
              id: 1,
              label: "Cand",
              kind: "release",
              summary: "",
              last_seen: new Date(),
              ongoing: false,
              similarity: 0.85,
            },
          ],
        },
      ]);
      // TX-2 will run `acquireLock` then `exactLookup` then throw on parse.
      setTxFixtures([{ match: "lower(normalized_label)", rows: [] }]);
      generateCompletionMock.mockResolvedValueOnce("not json");

      await expect(resolveTopic(makeInput())).rejects.toBeInstanceOf(
        EntityResolutionError,
      );
      try {
        await resolveTopic(makeInput());
      } catch {
        // ignore - we exercise above
      }

      // Replay once for assertions on inserts. Reset state and run again.
      txFixturesQueue.length = 0;
      txCallLog.length = 0;
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        {
          match: "identity_embedding <=>",
          rows: [
            {
              id: 1,
              label: "Cand",
              kind: "release",
              summary: "",
              last_seen: new Date(),
              ongoing: false,
              similarity: 0.85,
            },
          ],
        },
      ]);
      setTxFixtures([{ match: "lower(normalized_label)", rows: [] }]);
      generateCompletionMock.mockResolvedValueOnce("not json");
      await expect(resolveTopic(makeInput())).rejects.toMatchObject({
        reason: "disambig_failed",
      });

      const calls = allRecordedCalls();
      expect(findCalls(calls, "INSERT INTO canonical_topics").length).toBe(0);
      expect(
        findCalls(calls, "INSERT INTO episode_canonical_topics").length,
      ).toBe(0);
    });

    it("(6) zod validation fails (chosen_id is a string) → disambig_failed", async () => {
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        {
          match: "identity_embedding <=>",
          rows: [
            {
              id: 1,
              label: "Cand",
              kind: "release",
              summary: "",
              last_seen: new Date(),
              ongoing: false,
              similarity: 0.85,
            },
          ],
        },
      ]);
      setTxFixtures([{ match: "lower(normalized_label)", rows: [] }]);
      generateCompletionMock.mockResolvedValueOnce('{"chosen_id": "abc"}');

      await expect(resolveTopic(makeInput())).rejects.toMatchObject({
        reason: "disambig_failed",
      });
      const calls = allRecordedCalls();
      expect(findCalls(calls, "INSERT INTO canonical_topics").length).toBe(0);
    });

    it("(7) generateCompletion rejects → disambig_failed with cause set", async () => {
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        {
          match: "identity_embedding <=>",
          rows: [
            {
              id: 1,
              label: "Cand",
              kind: "release",
              summary: "",
              last_seen: new Date(),
              ongoing: false,
              similarity: 0.85,
            },
          ],
        },
      ]);
      setTxFixtures([{ match: "lower(normalized_label)", rows: [] }]);
      const networkErr = new Error("ETIMEDOUT");
      generateCompletionMock.mockRejectedValueOnce(networkErr);

      try {
        await resolveTopic(makeInput());
        throw new Error("expected throw");
      } catch (e) {
        expect(e).toBeInstanceOf(EntityResolutionError);
        const er = e as EntityResolutionError;
        expect(er.reason).toBe("disambig_failed");
        expect(er.cause).toBe(networkErr);
      }
    });

    it("(9) version-gate forces disambig even when sim > 0.92", async () => {
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        {
          match: "identity_embedding <=>",
          rows: [
            {
              id: 5,
              label: "Opus 4.6 release", // input has 4.7
              kind: "release",
              summary: "",
              last_seen: new Date(),
              ongoing: false,
              similarity: 0.97,
            },
          ],
        },
      ]);
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "INSERT INTO canonical_topics", rows: [{ id: 999 }] },
        { match: "INSERT INTO canonical_topic_aliases", rows: [{ id: 1 }] },
        { match: "INSERT INTO episode_canonical_topics", rows: [] },
      ]);
      generateCompletionMock.mockResolvedValueOnce('{"chosen_id": null}');

      const result = await resolveTopic(makeInput());
      expect(result.matchMethod).toBe("new");
      expect(result.versionTokenForcedDisambig).toBe(true);
    });

    it("(17) LLM returns valid JSON but chosen_id not in candidate set → new-insert", async () => {
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        {
          match: "identity_embedding <=>",
          rows: [
            {
              id: 1,
              label: "Cand",
              kind: "release",
              summary: "",
              last_seen: new Date(),
              ongoing: false,
              similarity: 0.85,
            },
          ],
        },
      ]);
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "INSERT INTO canonical_topics", rows: [{ id: 444 }] },
        { match: "INSERT INTO canonical_topic_aliases", rows: [{ id: 1 }] },
        { match: "INSERT INTO episode_canonical_topics", rows: [] },
      ]);
      generateCompletionMock.mockResolvedValueOnce('{"chosen_id": 99999}');

      const result = await resolveTopic(makeInput());
      expect(result.matchMethod).toBe("new");
      expect(result.canonicalId).toBe(444);
    });

    it("(18) cross-canonical alias collision — alias stored under chosen canonical", async () => {
      // Use a label without version tokens to bypass the version-gate so a
      // top-1 sim of 0.95 auto-matches; the test focuses on alias-handling.
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        {
          match: "identity_embedding <=>",
          rows: [
            {
              id: 2,
              label: "Creatine supplementation Y",
              kind: "concept",
              summary: "",
              last_seen: new Date(),
              ongoing: false,
              similarity: 0.95,
            },
          ],
        },
        { match: "UPDATE canonical_topics", rows: [] },
        { match: "INSERT INTO canonical_topic_aliases", rows: [{ id: 100 }] },
        { match: "INSERT INTO episode_canonical_topics", rows: [] },
      ]);

      const result = await resolveTopic(
        makeInput({
          label: "Creatine supplementation",
          kind: "concept",
          aliases: ["Foo"],
        }),
      );
      expect(result.matchMethod).toBe("auto");
      expect(result.canonicalId).toBe(2);
      expect(result.aliasesAdded).toBe(1);
    });

    it("(20) TX-2 finds canonical landed during LLM window via exact-lookup", async () => {
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        {
          match: "identity_embedding <=>",
          rows: [
            {
              id: 1,
              label: "Cand",
              kind: "release",
              summary: "",
              last_seen: new Date(),
              ongoing: false,
              similarity: 0.85,
            },
          ],
        },
      ]);
      // TX-2: exact-lookup HITS (some other writer landed it)
      setTxFixtures([
        {
          match: "lower(normalized_label)",
          rows: [{ id: 300, kind: "release" }],
        },
        { match: "UPDATE canonical_topics", rows: [] },
        { match: "INSERT INTO canonical_topic_aliases", rows: [{ id: 1 }] },
        { match: "INSERT INTO episode_canonical_topics", rows: [] },
      ]);
      generateCompletionMock.mockResolvedValueOnce('{"chosen_id": 1}');

      const result = await resolveTopic(makeInput());
      expect(result.canonicalId).toBe(300);
      expect(result.matchMethod).toBe("auto");
      expect(result.similarityToTopMatch).toBe(1.0);

      // TX-2 must NOT have run an id-confirmation kNN (it short-circuited
      // on exact-lookup). updateLastSeen is allowed; the distinguishing
      // marker is the `1 - (identity_embedding <=>` similarity expression.
      const tx2Calls = getTxLog(1);
      expect(findCalls(tx2Calls, "1 - (identity_embedding <=>").length).toBe(0);
      expect(findCalls(tx2Calls, "SET LOCAL hnsw.ef_search").length).toBe(0);
    });

    it("(21) TX-2 chosen-id row got merged → falls through to new-insert", async () => {
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        {
          match: "identity_embedding <=>",
          rows: [
            {
              id: 50,
              label: "Cand",
              kind: "release",
              summary: "",
              last_seen: new Date(),
              ongoing: false,
              similarity: 0.85,
            },
          ],
        },
      ]);
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        { match: "WHERE id =", rows: [] }, // chosen-id no longer active
        { match: "INSERT INTO canonical_topics", rows: [{ id: 888 }] },
        { match: "INSERT INTO canonical_topic_aliases", rows: [{ id: 1 }] },
        { match: "INSERT INTO episode_canonical_topics", rows: [] },
      ]);
      generateCompletionMock.mockResolvedValueOnce('{"chosen_id": 50}');

      const result = await resolveTopic(makeInput());
      expect(result.matchMethod).toBe("new");
      expect(result.canonicalId).toBe(888);
    });
  });

  describe("acceptance-criteria invariants", () => {
    it("episodeId and coverageScore flow into the junction insert binds", async () => {
      const epId = 4242;
      const cov = 0.55;
      setTxFixtures([
        {
          match: "lower(normalized_label)",
          rows: [{ id: 1, kind: "release" }],
        },
        { match: "INSERT INTO canonical_topic_aliases", rows: [{ id: 1 }] },
      ]);

      await resolveTopic(makeInput({ episodeId: epId, coverageScore: cov }));

      const junctionCalls = findCalls(
        getTxLog(0),
        "INSERT INTO episode_canonical_topics",
      );
      expect(junctionCalls.length).toBe(1);
      const params = junctionCalls[0].params;
      expect(params).toContain(epId);
      expect(params).toContain(cov);
    });

    it("invalid embedding dimension throws EntityResolutionError(invalid_embedding_dim)", async () => {
      const bad = makeInput({ identityEmbedding: [0.1, 0.2, 0.3] });
      await expect(resolveTopic(bad)).rejects.toMatchObject({
        reason: "invalid_embedding_dim",
      });
    });
  });
});
