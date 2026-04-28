// @vitest-environment node
// DB-gated integration tests for the entity-resolution module — exercises
// the advisory-lock + two-phase-LLM concurrency invariants against a real
// Postgres instance. Skipped when DATABASE_URL is unset (e.g. CI). Run
// locally: doppler run -- bun run test entity-resolution.concurrent

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { canonicalTopics } from "@/db/schema";
import { EMBEDDING_DIMENSION } from "@/lib/ai/embed-constants";
import {
  EntityResolutionError,
  resolveTopic,
  type ResolveTopicInput,
} from "@/lib/entity-resolution";

vi.mock("@/lib/ai/generate", () => ({
  generateCompletion: vi.fn(),
}));

const STABLE_EMBEDDING = Array.from(
  { length: EMBEDDING_DIMENSION },
  () => 0.001,
);

// Same embedding as STABLE — when the seeded canonical's label differs only
// by a version token (e.g. "Opus 4.6" vs "Opus 4.7") the version-gate forces
// the disambig path even at near-perfect cosine similarity.
const NEAR_EMBEDDING = STABLE_EMBEDDING;

const TEST_PREFIXES = [
  "__er_concurrent_test_",
  "__er_concurrent_collision_",
  "__er_concurrent_seed_",
  "__er_disambig_failed_",
  "__er_disambig_failed_seed_",
] as const;

async function cleanupByPrefix(prefix: string): Promise<void> {
  await db.execute(
    sql`DELETE FROM canonical_topic_aliases WHERE canonical_topic_id IN (SELECT id FROM canonical_topics WHERE starts_with(label, ${prefix}))`,
  );
  await db.execute(
    sql`DELETE FROM episode_canonical_topics WHERE canonical_topic_id IN (SELECT id FROM canonical_topics WHERE starts_with(label, ${prefix}))`,
  );
  await db.execute(
    sql`DELETE FROM canonical_topics WHERE starts_with(label, ${prefix})`,
  );
}

let episodeIdA: number;
let episodeIdB: number;

function buildInput(
  overrides: Partial<ResolveTopicInput> & {
    label: string;
    episodeId: number;
  },
): ResolveTopicInput {
  return {
    kind: "concept",
    summary: "integration-test summary",
    aliases: [],
    ongoing: false,
    relevance: 0.5,
    coverageScore: 0.5,
    identityEmbedding: STABLE_EMBEDDING,
    contextEmbedding: STABLE_EMBEDDING,
    ...overrides,
  };
}

describe.skipIf(!process.env.DATABASE_URL)(
  "entity-resolution — concurrent invariants",
  () => {
    beforeAll(async () => {
      const rows = await db.execute<{ id: number }>(
        sql`SELECT id FROM episodes ORDER BY id LIMIT 2`,
      );
      if (rows.rows.length < 2) {
        throw new Error(
          "Need at least 2 episodes seeded in the dev DB to run concurrent integration tests; UNIQUE (episode_id, canonical_topic_id) requires distinct episode ids per junction.",
        );
      }
      episodeIdA = rows.rows[0].id;
      episodeIdB = rows.rows[1].id;
    });

    afterAll(async () => {
      for (const p of TEST_PREFIXES) await cleanupByPrefix(p);
    });

    it("two parallel resolveTopic calls collapse to 1 canonical + 2 junctions", async () => {
      const { generateCompletion } = await import("@/lib/ai/generate");
      const mockedGen = vi.mocked(generateCompletion);
      mockedGen.mockReset();

      const label = `__er_concurrent_test_${Date.now()}`;
      const inputA = buildInput({ label, episodeId: episodeIdA });
      const inputB = buildInput({ label, episodeId: episodeIdB });

      const [resA, resB] = await Promise.all([
        resolveTopic(inputA),
        resolveTopic(inputB),
      ]);

      expect(resA.canonicalId).toBe(resB.canonicalId);
      const matchMethods = new Set([resA.matchMethod, resB.matchMethod]);
      expect(matchMethods.has("new")).toBe(true);
      expect(matchMethods.has("auto")).toBe(true);

      const canonicalRows = await db.execute<{ id: number }>(
        sql`SELECT id FROM canonical_topics WHERE label = ${label}`,
      );
      expect(canonicalRows.rows.length).toBe(1);

      const junctionRows = await db.execute<{
        episode_id: number;
        canonical_topic_id: number;
      }>(
        sql`SELECT episode_id, canonical_topic_id FROM episode_canonical_topics WHERE canonical_topic_id = ${resA.canonicalId}`,
      );
      expect(junctionRows.rows.length).toBe(2);
      const epIds = junctionRows.rows.map((r) => r.episode_id).sort();
      expect(epIds).toEqual([episodeIdA, episodeIdB].sort());

      // Disambiguator MUST NOT be called on the empty-slot fast path.
      expect(mockedGen).not.toHaveBeenCalled();
    });

    it("LLM-window collision: TX-2 exact-lookup catches the parallel landing", async () => {
      const { generateCompletion } = await import("@/lib/ai/generate");
      const mockedGen = vi.mocked(generateCompletion);
      mockedGen.mockReset();
      mockedGen.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 500));
        return '{"chosen_id": null}';
      });

      // Seed label has version 4.6; input label has version 4.7. The
      // version-gate forces the disambig path regardless of cosine similarity,
      // so we don't have to engineer a mid-band embedding.
      const ts = Date.now();
      const seedLabel = `__er_concurrent_seed_${ts} 4.6`;
      const collisionLabel = `__er_concurrent_collision_${ts} 4.7`;

      // Seed a near-neighbour at ~0.85 cosine to force the disambig path.
      await db.insert(canonicalTopics).values({
        label: seedLabel,
        normalizedLabel: seedLabel,
        kind: "concept",
        summary: "seed summary",
        ongoing: false,
        relevance: 0.5,
        identityEmbedding: NEAR_EMBEDDING,
        contextEmbedding: NEAR_EMBEDDING,
      });

      const inputA = buildInput({
        label: collisionLabel,
        episodeId: episodeIdA,
      });
      const inputB = buildInput({
        label: collisionLabel,
        episodeId: episodeIdB,
      });

      const [resA, resB] = await Promise.all([
        resolveTopic(inputA),
        resolveTopic(inputB),
      ]);

      expect(resA.canonicalId).toBe(resB.canonicalId);
      const canonicalRows = await db.execute<{ id: number }>(
        sql`SELECT id FROM canonical_topics WHERE label = ${collisionLabel}`,
      );
      expect(canonicalRows.rows.length).toBe(1);

      const junctionRows = await db.execute<{
        match_method: string;
        similarity_to_top_match: number | null;
      }>(
        sql`SELECT match_method, similarity_to_top_match FROM episode_canonical_topics WHERE canonical_topic_id = ${resA.canonicalId} ORDER BY id`,
      );
      expect(junctionRows.rows.length).toBe(2);
      const methods = new Set(junctionRows.rows.map((r) => r.match_method));
      expect(methods.has("new")).toBe(true);
      expect(methods.has("auto")).toBe(true);

      // The auto-match in this scenario came from TX-2 exact-lookup, not a
      // kNN match — confirmed by similarity = 1.0 on the auto junction.
      const autoJunction = junctionRows.rows.find(
        (r) => r.match_method === "auto",
      );
      expect(autoJunction?.similarity_to_top_match).toBeCloseTo(1.0);

      expect(mockedGen).toHaveBeenCalledTimes(2);
    });

    it("disambig_failed: malformed LLM JSON throws and writes nothing", async () => {
      const { generateCompletion } = await import("@/lib/ai/generate");
      const mockedGen = vi.mocked(generateCompletion);
      mockedGen.mockReset();
      mockedGen.mockResolvedValue("not json");

      const ts = Date.now();
      const seedLabel = `__er_disambig_failed_seed_${ts} 4.6`;
      const failLabel = `__er_disambig_failed_${ts} 4.7`;

      await db.insert(canonicalTopics).values({
        label: seedLabel,
        normalizedLabel: seedLabel,
        kind: "concept",
        summary: "seed summary",
        ongoing: false,
        relevance: 0.5,
        identityEmbedding: NEAR_EMBEDDING,
        contextEmbedding: NEAR_EMBEDDING,
      });

      const input = buildInput({ label: failLabel, episodeId: episodeIdA });

      await expect(resolveTopic(input)).rejects.toBeInstanceOf(
        EntityResolutionError,
      );
      await expect(resolveTopic(input)).rejects.toMatchObject({
        reason: "disambig_parse_failed",
      });

      const canonicalRows = await db.execute<{ id: number }>(
        sql`SELECT id FROM canonical_topics WHERE starts_with(label, ${"__er_disambig_failed_"}) AND label != ${seedLabel}`,
      );
      expect(canonicalRows.rows.length).toBe(0);

      const junctionRows = await db.execute<{ id: number }>(
        sql`SELECT id FROM episode_canonical_topics WHERE episode_id = ${episodeIdA} AND canonical_topic_id IN (SELECT id FROM canonical_topics WHERE starts_with(label, ${"__er_disambig_failed_"}))`,
      );
      expect(junctionRows.rows.length).toBe(0);

      // Pre-seeded near-neighbour preserved (different prefix anchor).
      const seedRows = await db.execute<{ id: number }>(
        sql`SELECT id FROM canonical_topics WHERE label = ${seedLabel}`,
      );
      expect(seedRows.rows.length).toBe(1);
    });
  },
);
