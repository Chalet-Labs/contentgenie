// @vitest-environment node

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// ---- Mocks (must precede all production imports) ----------------------------

// SQL-fixture-queue harness — mirrors entity-resolution.test.ts exactly.
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

// Required: resolve-topics.ts imports @trigger.dev/sdk at module load.
vi.mock("@trigger.dev/sdk", () => ({
  metadata: {
    root: {
      increment: vi.fn(),
    },
  },
  logger: { info: vi.fn(), warn: vi.fn() },
}));

// Required: resolve-topics.ts imports @/lib/ai/embed at module load.
vi.mock("@/lib/ai/embed", () => ({
  generateEmbeddings: vi.fn(),
}));

// Required: resolve-topics.ts imports @/trigger/helpers/database at module load.
vi.mock("@/trigger/helpers/database", () => ({
  forceInsertNewCanonical: vi.fn(),
  trackEpisodeRun: vi.fn(),
  persistEpisodeSummary: vi.fn(),
  updateEpisodeStatus: vi.fn(),
  addAliasIfNew: vi.fn(),
}));

// vi.mock is hoisted — top-level imports see the mocks.
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { canonicalTopics } from "@/db/schema";
import { EMBEDDING_DIMENSION } from "@/lib/ai/embed-constants";
import {
  hasVersionTokenMismatch,
  resolveTopic,
  type ResolveTopicInput,
  type ResolveTopicResult,
} from "@/lib/entity-resolution";
import {
  AUTO_MATCH_SIMILARITY_THRESHOLD,
  DISAMBIGUATE_SIMILARITY_THRESHOLD,
} from "@/lib/entity-resolution-constants";
import { resolveAndPersistEpisodeTopics } from "@/trigger/helpers/resolve-topics";
import { normalizeTopics } from "@/trigger/helpers/ai-summary";
import type { TopicKind } from "@/lib/openrouter";

// ---- Serializer (verbatim from entity-resolution.test.ts) -------------------

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

// ---- Types ------------------------------------------------------------------

type ResolverGoldenFixture = {
  _meta: {
    name: string;
    scenario: string;
    expectedOutcome: string;
  };
  seedCanonicals?: Array<{
    id: number;
    label: string;
    normalizedLabel: string;
    kind: TopicKind;
    summary: string;
    ongoing?: boolean;
    relevance?: number;
  }>;
  inputs: Array<{
    label: string;
    kind: TopicKind;
    summary: string;
    aliases: string[];
    ongoing: boolean;
    relevance: number;
    coverageScore: number;
    knnCandidates?: Array<{
      id: number;
      label: string;
      kind: TopicKind;
      summary: string;
      similarity: number;
    }>;
    disambiguatorResponse?: { chosenId: number | null } | { rawJson: string };
  }>;
  expected: {
    canonicalCount?: number;
    canonicalCountAtMost?: number;
    aliasCountAtLeast?: number;
    matchMethodDistribution?: Partial<Record<string, number>>;
    versionTokenForcedDisambig?: number;
    perInput?: Array<{
      matchMethod?: string;
      versionTokenForcedDisambig?: boolean;
    }>;
    junctionCountForSingleCanonical?: number;
  };
  // Optional: used by philosophical-no-topic fixture
  aiRawOutput?: { topics: unknown[] };
};

// ---- Embedding helper -------------------------------------------------------

const STABLE_EMBEDDING = Array.from(
  { length: EMBEDDING_DIMENSION },
  () => 0.001,
);

function buildInput(
  entry: ResolverGoldenFixture["inputs"][number],
  episodeId: number,
): ResolveTopicInput {
  return {
    label: entry.label,
    kind: entry.kind,
    summary: entry.summary,
    aliases: entry.aliases,
    ongoing: entry.ongoing,
    relevance: entry.relevance,
    coverageScore: entry.coverageScore,
    episodeId,
    identityEmbedding: STABLE_EMBEDDING,
    contextEmbedding: STABLE_EMBEDDING,
  };
}

// Detect which TX-1 path an input will take based on kNN candidates and version
// tokens — mirrors the decision tree in runTx1.
function detectTx1Path(
  entry: ResolverGoldenFixture["inputs"][number],
  exactHit: boolean,
): "exact" | "knn-auto" | "disambig" | "new-insert" {
  if (exactHit) return "exact";
  const top = (entry.knnCandidates ?? [])[0];
  if (!top) return "new-insert";
  const versionMismatch = hasVersionTokenMismatch(entry.label, top.label);
  if (
    top.similarity > AUTO_MATCH_SIMILARITY_THRESHOLD &&
    top.kind === entry.kind &&
    !versionMismatch
  ) {
    return "knn-auto";
  }
  if (
    versionMismatch ||
    (entry.knnCandidates ?? []).some(
      (c) => c.similarity >= DISAMBIGUATE_SIMILARITY_THRESHOLD,
    )
  ) {
    return "disambig";
  }
  return "new-insert";
}

// ---- Fixture adapters -------------------------------------------------------

interface RunFixtureResult {
  input: ResolverGoldenFixture["inputs"][number];
  result: ResolveTopicResult;
}

// Tracks canonical IDs seen across inputs so we can assert canonicalCount.
let seenCanonicalIds: Set<number>;

async function runFixtureWithMockDb(
  fixture: ResolverGoldenFixture,
): Promise<RunFixtureResult[]> {
  seenCanonicalIds = new Set((fixture.seedCanonicals ?? []).map((s) => s.id));
  const results: RunFixtureResult[] = [];

  const seedMap = new Map((fixture.seedCanonicals ?? []).map((s) => [s.id, s]));

  // Running counter for new canonical IDs inserted during this run.
  let nextNewId = 900;

  for (const entry of fixture.inputs) {
    const normalizedInputLabel = entry.label.trim().toLowerCase();

    const exactHit = Array.from(seedMap.values()).find(
      (s) => s.normalizedLabel === normalizedInputLabel,
    );

    const path = detectTx1Path(entry, exactHit !== undefined);

    // Queue disambiguator response before registering fixtures.
    if (entry.disambiguatorResponse !== undefined) {
      const resp = entry.disambiguatorResponse;
      const jsonStr =
        "rawJson" in resp
          ? resp.rawJson
          : `{"chosen_id": ${resp.chosenId === null ? "null" : resp.chosenId}}`;
      generateCompletionMock.mockResolvedValueOnce(jsonStr);
    }

    const knnRows = (entry.knnCandidates ?? []).map((c) => ({
      id: c.id,
      label: c.label,
      kind: c.kind,
      summary: c.summary,
      last_seen: new Date(),
      ongoing: false,
      similarity: c.similarity,
    }));

    if (path === "exact") {
      setTxFixtures([
        {
          match: "lower(normalized_label)",
          rows: [{ id: exactHit!.id, kind: exactHit!.kind }],
        },
        { match: "UPDATE canonical_topics", rows: [] },
        { match: "INSERT INTO canonical_topic_aliases", rows: [{ id: 1 }] },
        { match: "INSERT INTO episode_canonical_topics", rows: [] },
      ]);
    } else if (path === "knn-auto") {
      const top = entry.knnCandidates![0];
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        { match: "identity_embedding <=>", rows: knnRows },
        { match: "UPDATE canonical_topics", rows: [] },
        { match: "INSERT INTO canonical_topic_aliases", rows: [{ id: 1 }] },
        { match: "INSERT INTO episode_canonical_topics", rows: [] },
      ]);
      seenCanonicalIds.add(top.id);
    } else if (path === "disambig") {
      // TX-1: exact miss + kNN
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        { match: "identity_embedding <=>", rows: knnRows },
      ]);

      // TX-2: depends on what the LLM returns
      const resp = entry.disambiguatorResponse;
      const chosenId = resp && !("rawJson" in resp) ? resp.chosenId : null;
      const tx2Fixtures: SqlFixture[] = [
        { match: "lower(normalized_label)", rows: [] },
      ];

      if (chosenId !== null && chosenId !== undefined) {
        const candidate = (entry.knnCandidates ?? []).find(
          (c) => c.id === chosenId,
        );
        tx2Fixtures.push({ match: "SET LOCAL hnsw.ef_search", rows: [] });
        tx2Fixtures.push({
          match: "WHERE id =",
          rows: candidate
            ? [
                {
                  id: chosenId,
                  kind: candidate.kind,
                  similarity: candidate.similarity,
                },
              ]
            : [],
        });
        if (candidate && candidate.kind === entry.kind) {
          tx2Fixtures.push({ match: "UPDATE canonical_topics", rows: [] });
          tx2Fixtures.push({
            match: "INSERT INTO canonical_topic_aliases",
            rows: [{ id: 1 }],
          });
          tx2Fixtures.push({
            match: "INSERT INTO episode_canonical_topics",
            rows: [],
          });
          seenCanonicalIds.add(chosenId);
        } else {
          const newId = nextNewId++;
          tx2Fixtures.push({
            match: "INSERT INTO canonical_topics",
            rows: [{ id: newId }],
          });
          tx2Fixtures.push({
            match: "INSERT INTO canonical_topic_aliases",
            rows: [{ id: 1 }],
          });
          tx2Fixtures.push({
            match: "INSERT INTO episode_canonical_topics",
            rows: [],
          });
          seenCanonicalIds.add(newId);
        }
      } else {
        // LLM returned null → new insert
        const newId = nextNewId++;
        tx2Fixtures.push({
          match: "INSERT INTO canonical_topics",
          rows: [{ id: newId }],
        });
        tx2Fixtures.push({
          match: "INSERT INTO canonical_topic_aliases",
          rows: [{ id: 1 }],
        });
        tx2Fixtures.push({
          match: "INSERT INTO episode_canonical_topics",
          rows: [],
        });
        seenCanonicalIds.add(newId);
      }
      setTxFixtures(tx2Fixtures);
    } else {
      // new-insert via TX-1
      const newId = nextNewId++;
      setTxFixtures([
        { match: "lower(normalized_label)", rows: [] },
        { match: "SET LOCAL hnsw.ef_search", rows: [] },
        { match: "identity_embedding <=>", rows: [] },
        { match: "INSERT INTO canonical_topics", rows: [{ id: newId }] },
        { match: "INSERT INTO canonical_topic_aliases", rows: [{ id: 1 }] },
        { match: "INSERT INTO episode_canonical_topics", rows: [] },
      ]);
      seenCanonicalIds.add(newId);
    }

    const result = await resolveTopic(buildInput(entry, 1000 + results.length));
    seenCanonicalIds.add(result.canonicalId);
    results.push({ input: entry, result });
  }

  return results;
}

async function runFixtureWithRealDb(
  fixture: ResolverGoldenFixture,
  episodeIdA: number,
  episodeIdB: number,
): Promise<{ resultA: ResolveTopicResult; resultB: ResolveTopicResult }> {
  const ts = Date.now();
  const inputs = fixture.inputs.map((entry) => ({
    ...entry,
    label: entry.label.replace("<TS>", String(ts)),
  }));

  const [resultA, resultB] = await Promise.all([
    resolveTopic(buildInput(inputs[0], episodeIdA)),
    resolveTopic(buildInput(inputs[1], episodeIdB)),
  ]);

  return { resultA, resultB };
}

// ---- Lifecycle --------------------------------------------------------------

beforeEach(() => {
  txFixturesQueue.length = 0;
  txCallLog.length = 0;
  generateCompletionMock.mockReset();
});

afterEach(() => {
  txFixturesQueue.length = 0;
  txCallLog.length = 0;
});

// ---- Fixtures (imported via resolveJsonModule) ------------------------------

import versionAdjacentReleasesFixture from "./fixtures/entity-resolution/version-adjacent-releases.json";
import aliasClustersFixture from "./fixtures/entity-resolution/alias-clusters.json";
import conceptClusteringFixture from "./fixtures/entity-resolution/concept-clustering.json";
import philosophicalNoTopicFixture from "./fixtures/entity-resolution/philosophical-no-topic.json";
import concurrentInsertRaceFixture from "./fixtures/entity-resolution/concurrent-insert-race.json";

// ---- Test suites ------------------------------------------------------------

describe("entity-resolution golden dataset", () => {
  describe("with mocked DB", () => {
    it("version-adjacent-releases", async () => {
      const fixture =
        versionAdjacentReleasesFixture as unknown as ResolverGoldenFixture;
      const results = await runFixtureWithMockDb(fixture);

      expect(results).toHaveLength(1);
      expect(results[0].result.matchMethod).toBe(
        fixture.expected.perInput?.[0]?.matchMethod,
      );
      expect(results[0].result.versionTokenForcedDisambig).toBe(
        fixture.expected.perInput?.[0]?.versionTokenForcedDisambig,
      );

      // canonicalCount=2: seed + newly inserted canonical
      expect(seenCanonicalIds.size).toBe(fixture.expected.canonicalCount);

      // versionTokenForcedDisambig count across all inputs
      const forcedCount = results.filter(
        (r) => r.result.versionTokenForcedDisambig,
      ).length;
      expect(forcedCount).toBe(fixture.expected.versionTokenForcedDisambig);
    });

    it("alias-clusters", async () => {
      const fixture = aliasClustersFixture as unknown as ResolverGoldenFixture;
      const results = await runFixtureWithMockDb(fixture);

      expect(results).toHaveLength(4);

      // All 4 inputs resolve to the same canonical
      const uniqueCanonicals = new Set(
        results.map((r) => r.result.canonicalId),
      );
      expect(uniqueCanonicals.size).toBe(fixture.expected.canonicalCount);

      // Alias SQL emissions: count actual INSERT INTO canonical_topic_aliases calls
      const aliasInsertCalls = allRecordedCalls().filter((c) =>
        c.sql.includes("INSERT INTO canonical_topic_aliases"),
      );
      expect(aliasInsertCalls.length).toBeGreaterThanOrEqual(
        fixture.expected.aliasCountAtLeast!,
      );
    });

    it("concept-clustering", async () => {
      const fixture =
        conceptClusteringFixture as unknown as ResolverGoldenFixture;
      const results = await runFixtureWithMockDb(fixture);

      expect(results).toHaveLength(3);

      const uniqueCanonicals = new Set(
        results.map((r) => r.result.canonicalId),
      );
      expect(uniqueCanonicals.size).toBeGreaterThanOrEqual(1);
      if (fixture.expected.canonicalCountAtMost !== undefined) {
        expect(uniqueCanonicals.size).toBeLessThanOrEqual(
          fixture.expected.canonicalCountAtMost,
        );
      }

      // Assert match method distribution
      const distribution: Record<string, number> = {};
      for (const { result } of results) {
        distribution[result.matchMethod] =
          (distribution[result.matchMethod] ?? 0) + 1;
      }
      if (fixture.expected.matchMethodDistribution) {
        for (const [method, count] of Object.entries(
          fixture.expected.matchMethodDistribution,
        )) {
          expect(distribution[method] ?? 0).toBe(count);
        }
      }
    });

    it("philosophical-no-topic", async () => {
      const fixture =
        philosophicalNoTopicFixture as unknown as ResolverGoldenFixture & {
          aiRawOutput: { topics: unknown[] };
        };

      // normalizeTopics returns [] for empty array input
      const normalized = normalizeTopics(fixture.aiRawOutput.topics, []);
      expect(normalized).toHaveLength(0);

      // resolveAndPersistEpisodeTopics early-exits: no SQL, zeroed result
      const result = await resolveAndPersistEpisodeTopics(1, [], "summary");
      expect(result.topicCount).toBe(0);
      expect(result.resolved).toBe(0);
      expect(result.failed).toBe(0);

      // No transactional() was called (no SQL emissions)
      expect(txCallLog).toHaveLength(0);
    });
  });

  describe.skipIf(!process.env.DATABASE_URL)("with real DB", () => {
    let episodeIdA: number;
    let episodeIdB: number;
    const CONCURRENT_PREFIX = "__er_golden_concurrent_";

    beforeAll(async () => {
      const rows = await db.execute<{ id: number }>(
        sql`SELECT id FROM episodes ORDER BY id LIMIT 2`,
      );
      if (rows.rows.length < 2) {
        throw new Error(
          "Need at least 2 episodes in the dev DB to run golden concurrent test.",
        );
      }
      episodeIdA = rows.rows[0].id;
      episodeIdB = rows.rows[1].id;
    });

    afterAll(async () => {
      await db.execute(
        sql`DELETE FROM canonical_topic_aliases WHERE canonical_topic_id IN (SELECT id FROM canonical_topics WHERE starts_with(label, ${CONCURRENT_PREFIX}))`,
      );
      await db.execute(
        sql`DELETE FROM episode_canonical_topics WHERE canonical_topic_id IN (SELECT id FROM canonical_topics WHERE starts_with(label, ${CONCURRENT_PREFIX}))`,
      );
      await db.execute(
        sql`DELETE FROM canonical_topics WHERE starts_with(label, ${CONCURRENT_PREFIX})`,
      );
    });

    it("concurrent-insert-race", async () => {
      const fixture =
        concurrentInsertRaceFixture as unknown as ResolverGoldenFixture;

      const { generateCompletion } = await import("@/lib/ai/generate");
      const mockedGen = vi.mocked(generateCompletion);
      mockedGen.mockReset();

      const { resultA, resultB } = await runFixtureWithRealDb(
        fixture,
        episodeIdA,
        episodeIdB,
      );

      // Both calls collapse to the same canonical
      expect(resultA.canonicalId).toBe(resultB.canonicalId);

      // Exactly 1 canonical in the DB for this label prefix
      const canonicalRows = await db.execute<{ id: number }>(
        sql`SELECT id FROM canonical_topics WHERE starts_with(label, ${CONCURRENT_PREFIX}) ORDER BY id LIMIT 10`,
      );
      expect(canonicalRows.rows.length).toBe(
        fixture.expected.canonicalCount ?? 1,
      );

      // Exactly 2 junction rows pointing at the canonical
      const junctionRows = await db.execute<{ episode_id: number }>(
        sql`SELECT episode_id FROM episode_canonical_topics WHERE canonical_topic_id = ${resultA.canonicalId}`,
      );
      expect(junctionRows.rows.length).toBe(
        fixture.expected.junctionCountForSingleCanonical ?? 2,
      );
      const epIds = junctionRows.rows.map((r) => r.episode_id).sort();
      expect(epIds).toEqual([episodeIdA, episodeIdB].sort());

      // Disambiguator must NOT have been called (empty-slot fast path)
      expect(mockedGen).not.toHaveBeenCalled();
    });
  });
});
