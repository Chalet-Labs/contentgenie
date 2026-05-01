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

// SQL-fixture-queue harness lives in `@/test/sql-fixture-queue` — see that
// file's header for the Vitest hoisting constraint that forces the factory
// body to dynamic-import the harness.

// When the fixture queue is empty, fall through to the real `transactional`
// so the real-DB sub-suite (concurrent-insert-race) hits Postgres normally.
// Mocked sub-suites queue fixtures via `setTxFixtures` and the mock intercepts.
vi.mock("@/db/pool", async () => {
  const actual = await vi.importActual<typeof import("@/db/pool")>("@/db/pool");
  const { createTransactionalFixtureMockWithFallthrough } =
    await import("@/test/sql-fixture-queue");
  return {
    ...actual,
    transactional: createTransactionalFixtureMockWithFallthrough(actual),
  };
});

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
import { transactional } from "@/db/pool";
import { generateEmbeddings } from "@/lib/ai/embed";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import {
  hasVersionTokenMismatch,
  resolveTopic,
  type ResolveTopicInput,
  type ResolveTopicResult,
} from "@/lib/entity-resolution";
import {
  AUTO_MATCH_SIMILARITY_THRESHOLD,
  DISAMBIGUATE_SIMILARITY_THRESHOLD,
  type MatchMethod,
} from "@/lib/entity-resolution-constants";
import { resolveAndPersistEpisodeTopics } from "@/trigger/helpers/resolve-topics";
import { normalizeTopics } from "@/trigger/helpers/ai-summary";
import type { TopicKind } from "@/lib/openrouter";
import {
  type SqlFixture,
  allRecordedCalls,
  resetTxState,
  setTxFixtures,
} from "@/test/sql-fixture-queue";
import { STABLE_EMBEDDING } from "@/test/embeddings";

// First runtime-allocated canonical id used by the mock harness.
// Fixtures referencing newly-inserted canonicals (e.g. concept-clustering)
// rely on this value to seed kNN candidates for subsequent inputs.
const MOCK_NEW_CANONICAL_BASE_ID = 900;

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
    matchMethodDistribution?: Partial<Record<MatchMethod, number>>;
    versionTokenForcedDisambig?: number;
    perInput?: Array<{
      matchMethod?: MatchMethod;
      versionTokenForcedDisambig?: boolean;
    }>;
    junctionCountForSingleCanonical?: number;
  };
  // Optional: used by philosophical-no-topic fixture
  aiRawOutput?: { topics: unknown[] };
};

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

interface RunFixtureOutput {
  results: RunFixtureResult[];
  seenCanonicalIds: Set<number>;
}

async function runFixtureWithMockDb(
  fixture: ResolverGoldenFixture,
): Promise<RunFixtureOutput> {
  const seenCanonicalIds = new Set(
    (fixture.seedCanonicals ?? []).map((s) => s.id),
  );
  const results: RunFixtureResult[] = [];

  const seedMap = new Map((fixture.seedCanonicals ?? []).map((s) => [s.id, s]));

  // Running counter for new canonical IDs inserted during this run.
  let nextNewId = MOCK_NEW_CANONICAL_BASE_ID;

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
          tx2Fixtures.push({ match: "UPDATE canonical_topics", rows: [] });
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
        tx2Fixtures.push({ match: "UPDATE canonical_topics", rows: [] });
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
        { match: "UPDATE canonical_topics", rows: [] },
        { match: "INSERT INTO canonical_topic_aliases", rows: [{ id: 1 }] },
        { match: "INSERT INTO episode_canonical_topics", rows: [] },
      ]);
      seenCanonicalIds.add(newId);
    }

    const result = await resolveTopic(buildInput(entry, 1000 + results.length));
    seenCanonicalIds.add(result.canonicalId);
    results.push({ input: entry, result });
  }

  return { results, seenCanonicalIds };
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
  resetTxState();
  generateCompletionMock.mockReset();
  vi.mocked(transactional).mockClear();
  vi.mocked(generateEmbeddings).mockClear();
});

afterEach(() => {
  resetTxState();
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
      const { results, seenCanonicalIds } = await runFixtureWithMockDb(fixture);

      // Anchor against literal expected behaviour, not just the fixture's own
      // declarations — pinning at the assertion site stops a fixture edit from
      // silently flipping the contract.
      expect(fixture.expected.perInput?.[0]?.matchMethod).toBe("new");
      expect(fixture.expected.perInput?.[0]?.versionTokenForcedDisambig).toBe(
        true,
      );
      expect(fixture.expected.canonicalCount).toBe(2);
      expect(fixture.expected.versionTokenForcedDisambig).toBe(1);

      expect(results).toHaveLength(fixture.inputs.length);
      expect(results[0].result.matchMethod).toBe("new");
      expect(results[0].result.versionTokenForcedDisambig).toBe(true);
      expect(seenCanonicalIds.size).toBe(2);

      const forcedCount = results.filter(
        (r) => r.result.versionTokenForcedDisambig,
      ).length;
      expect(forcedCount).toBe(1);
    });

    it("alias-clusters", async () => {
      const fixture = aliasClustersFixture as unknown as ResolverGoldenFixture;
      const { results } = await runFixtureWithMockDb(fixture);

      expect(results).toHaveLength(fixture.inputs.length);

      const uniqueCanonicals = new Set(
        results.map((r) => r.result.canonicalId),
      );
      expect(uniqueCanonicals.size).toBe(1);

      // Counts production SQL emissions, not pre-registered fixture rows —
      // verifies the resolver actually attempted ≥4 alias upserts.
      const aliasInsertCalls = allRecordedCalls().filter((c) =>
        c.sql.includes("INSERT INTO canonical_topic_aliases"),
      );
      expect(aliasInsertCalls.length).toBeGreaterThanOrEqual(4);

      // Pin the match-method distribution: 3 auto + 1 llm_disambig.
      // Input 3 ("Anthropic's new Opus") triggers version-token disambig.
      const distribution: Partial<Record<MatchMethod, number>> = {};
      for (const { result } of results) {
        distribution[result.matchMethod] =
          (distribution[result.matchMethod] ?? 0) + 1;
      }
      expect(distribution.auto ?? 0).toBe(3);
      expect(distribution.llm_disambig ?? 0).toBe(1);
    });

    it("concept-clustering", async () => {
      const fixture =
        conceptClusteringFixture as unknown as ResolverGoldenFixture;
      const { results } = await runFixtureWithMockDb(fixture);

      expect(results).toHaveLength(fixture.inputs.length);

      // Pin the canonical-split count: a regression that collapses all 3
      // creatine forms onto one canonical must fail loudly, not pass with
      // `>= 1 && <= 2`.
      const uniqueCanonicals = new Set(
        results.map((r) => r.result.canonicalId),
      );
      expect(fixture.expected.canonicalCount).toBe(2);
      expect(uniqueCanonicals.size).toBe(2);

      const distribution: Partial<Record<MatchMethod, number>> = {};
      for (const { result } of results) {
        distribution[result.matchMethod] =
          (distribution[result.matchMethod] ?? 0) + 1;
      }
      // Pin literal distribution: 2 new-inserts + 1 llm_disambig.
      // "creatine supplementation" merges via LLM; "creatine monohydrate" splits.
      expect(distribution.new ?? 0).toBe(2);
      expect(distribution.llm_disambig ?? 0).toBe(1);
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

      // Pin the early-exit contract: transactional() and generateEmbeddings()
      // must not be called for empty-topic input.
      expect(vi.mocked(transactional)).not.toHaveBeenCalled();
      expect(vi.mocked(generateEmbeddings)).not.toHaveBeenCalled();
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
      // FK cascade from canonical_topics handles aliases and junctions.
      await db.execute(
        sql`DELETE FROM canonical_topics WHERE starts_with(label, ${CONCURRENT_PREFIX})`,
      );
    });

    it("concurrent-insert-race", async () => {
      const fixture =
        concurrentInsertRaceFixture as unknown as ResolverGoldenFixture;
      const inputKind = fixture.inputs[0].kind;

      const { resultA, resultB } = await runFixtureWithRealDb(
        fixture,
        episodeIdA,
        episodeIdB,
      );

      expect(fixture.expected.canonicalCount).toBe(1);
      expect(fixture.expected.junctionCountForSingleCanonical).toBe(2);

      expect(resultA.canonicalId).toBe(resultB.canonicalId);

      // Strict scope: a stray row of the same prefix but different kind
      // would slip past a starts_with-only check.
      const canonicalRows = await db.execute<{ id: number }>(
        sql`SELECT id FROM canonical_topics
            WHERE starts_with(label, ${CONCURRENT_PREFIX})
              AND kind = ${inputKind}`,
      );
      expect(canonicalRows.rows.length).toBe(fixture.expected.canonicalCount);

      const junctionRows = await db.execute<{ episode_id: number }>(
        sql`SELECT episode_id FROM episode_canonical_topics WHERE canonical_topic_id = ${resultA.canonicalId}`,
      );
      expect(junctionRows.rows.length).toBe(
        fixture.expected.junctionCountForSingleCanonical,
      );
      const epIds = junctionRows.rows.map((r) => r.episode_id).sort();
      expect(epIds).toEqual([episodeIdA, episodeIdB].sort());

      // Empty-slot fast path: TX-1 exact-lookup catches both arrivals.
      expect(generateCompletionMock).not.toHaveBeenCalled();
    });
  });
});
