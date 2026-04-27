// @vitest-environment node
// Integration smoke tests for canonical-topics schema constraints (ADR-042).
// Requires a live DATABASE_URL — skipped in CI (no DATABASE_URL set).
// Run locally: doppler run -- bun run test src/db/__tests__/canonical-topics.schema.test.ts

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  canonicalTopics,
  canonicalTopicAliases,
  episodeCanonicalTopics,
} from "@/db/schema";

// Stable 1024-dim fixture — content irrelevant for constraint tests.
const EMBEDDING = Array.from({ length: 1024 }, () => 0.001);

// Base row that satisfies every constraint (happy path).
const validTopic = {
  label: "__schema_test_valid",
  normalizedLabel: "__schema_test_valid",
  kind: "concept" as const,
  status: "active" as const,
  summary: "__schema_test_summary",
  ongoing: false,
  relevance: 0.5,
  episodeCount: 0,
  identityEmbedding: EMBEDDING,
  contextEmbedding: EMBEDDING,
  embeddingModelVersion: "pplx-embed-v1-0.6b",
};

// Helper: look for a Postgres SQLSTATE code on the thrown error.
// The Neon HTTP driver wraps the NeonDbError in `err.cause` rather than
// surfacing it directly on the thrown object.
function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
}

// Helper: insert a minimal valid episode fixture for junction tests.
// Returns the episode id from the first episode that exists in the DB.
let fixtureEpisodeId: number;
let fixtureTopicId: number;

describe.skipIf(!process.env.DATABASE_URL)(
  "canonical-topics schema constraints",
  () => {
    beforeAll(async () => {
      // Use the first episode that already exists in the DB.
      const rows = await db.execute<{ id: number }>(
        sql`SELECT id FROM episodes LIMIT 1`,
      );
      if (rows.rows.length === 0) {
        throw new Error(
          "No episode rows in DB — seed at least one episode before running this test.",
        );
      }
      fixtureEpisodeId = rows.rows[0].id;

      // Insert a stable canonical_topic fixture for junction tests.
      const [topic] = await db
        .insert(canonicalTopics)
        .values({
          ...validTopic,
          label: "__schema_test_fixture",
          normalizedLabel: "__schema_test_fixture",
        })
        .returning({ id: canonicalTopics.id });
      fixtureTopicId = topic.id;
    });

    afterAll(async () => {
      await db.execute(
        sql`DELETE FROM canonical_topics WHERE label LIKE '__schema_test_%'`,
      );
    });

    afterEach(async () => {
      // Remove any test rows inserted mid-test (excluding the fixture row
      // which is cleaned up in afterAll).
      await db.execute(
        sql`DELETE FROM canonical_topics WHERE label LIKE '__schema_test_%' AND label != '__schema_test_fixture'`,
      );
      await db.execute(
        sql`DELETE FROM episode_canonical_topics WHERE episode_id = ${fixtureEpisodeId} AND canonical_topic_id = ${fixtureTopicId}`,
      );
    });

    // Happy path — guard against silent schema drift on the basic insert path.
    it("inserts a fully-valid canonical_topic row", async () => {
      const [row] = await db
        .insert(canonicalTopics)
        .values({ ...validTopic, label: "__schema_test_happy_path" })
        .returning({ id: canonicalTopics.id });
      expect(row.id).toBeTypeOf("number");
    });

    // 1. Biconditional direction A — merged with NULL target is rejected.
    it("rejects status=merged with merged_into_id=NULL (ct_merged_biconditional A)", async () => {
      const err = await db
        .insert(canonicalTopics)
        .values({
          ...validTopic,
          label: "__schema_test_bicond_a",
          status: "merged",
          mergedIntoId: null,
        })
        .catch((e) => e);
      expect(pgCode(err)).toBe("23514");
    });

    // 2. Biconditional direction B — active with a non-null target is rejected.
    it("rejects status=active with merged_into_id set (ct_merged_biconditional B)", async () => {
      const err = await db
        .insert(canonicalTopics)
        .values({
          ...validTopic,
          label: "__schema_test_bicond_b",
          status: "active",
          mergedIntoId: fixtureTopicId,
        })
        .catch((e) => e);
      expect(pgCode(err)).toBe("23514");
    });

    // 3. Self-merge ban — UPDATE to point merged_into_id at own id.
    it("rejects setting merged_into_id = id (ct_no_self_merge)", async () => {
      const [row] = await db
        .insert(canonicalTopics)
        .values({ ...validTopic, label: "__schema_test_self_merge" })
        .returning({ id: canonicalTopics.id });

      const err = await db
        .execute(
          sql`UPDATE canonical_topics SET status = 'merged', merged_into_id = ${row.id} WHERE id = ${row.id}`,
        )
        .catch((e) => e);
      expect(pgCode(err)).toBe("23514");
    });

    // 4. Relevance below 0.
    it("rejects relevance = -0.1 (ct_relevance_range)", async () => {
      const err = await db
        .insert(canonicalTopics)
        .values({
          ...validTopic,
          label: "__schema_test_rel_low",
          relevance: -0.1,
        })
        .catch((e) => e);
      expect(pgCode(err)).toBe("23514");
    });

    // 5. Relevance above 1.
    it("rejects relevance = 1.5 (ct_relevance_range)", async () => {
      const err = await db
        .insert(canonicalTopics)
        .values({
          ...validTopic,
          label: "__schema_test_rel_high",
          relevance: 1.5,
        })
        .catch((e) => e);
      expect(pgCode(err)).toBe("23514");
    });

    // 6. episode_count negative.
    it("rejects episode_count = -1 (ct_episode_count_gte_0)", async () => {
      const err = await db
        .insert(canonicalTopics)
        .values({
          ...validTopic,
          label: "__schema_test_count_neg",
          episodeCount: -1,
        })
        .catch((e) => e);
      expect(pgCode(err)).toBe("23514");
    });

    // 7. Blank label (whitespace only).
    it("rejects label = '   ' (ct_label_not_blank)", async () => {
      const err = await db
        .insert(canonicalTopics)
        .values({ ...validTopic, label: "   " })
        .catch((e) => e);
      expect(pgCode(err)).toBe("23514");
    });

    // 8. Blank summary (empty string).
    it("rejects summary = '' (ct_summary_not_blank)", async () => {
      const err = await db
        .insert(canonicalTopics)
        .values({
          ...validTopic,
          label: "__schema_test_blank_sum",
          summary: "",
        })
        .catch((e) => e);
      expect(pgCode(err)).toBe("23514");
    });

    // 9. Partial unique index on (lower(normalized_label), kind) WHERE status='active'.
    it("rejects duplicate (normalized_label, kind) while both active, but allows dormant", async () => {
      await db.insert(canonicalTopics).values({
        ...validTopic,
        label: "__schema_test_puidx_1",
        normalizedLabel: "__schema_test_puidx",
        kind: "concept",
        status: "active",
      });

      // Second active row with same pair — must fail.
      const err = await db
        .insert(canonicalTopics)
        .values({
          ...validTopic,
          label: "__schema_test_puidx_2",
          normalizedLabel: "__schema_test_puidx",
          kind: "concept",
          status: "active",
        })
        .catch((e) => e);
      expect(pgCode(err)).toBe("23505");

      // Dormant row with same pair — must succeed (partial filter excludes it).
      const [dormant] = await db
        .insert(canonicalTopics)
        .values({
          ...validTopic,
          label: "__schema_test_puidx_dormant",
          normalizedLabel: "__schema_test_puidx",
          kind: "concept",
          status: "dormant",
        })
        .returning({ id: canonicalTopics.id });
      expect(dormant.id).toBeTypeOf("number");
    });

    // 10. Junction match_method must be one of 'auto','llm_disambig','new'.
    it("rejects match_method='manual' (ect_match_method_enum)", async () => {
      const err = await db
        .insert(episodeCanonicalTopics)
        .values({
          episodeId: fixtureEpisodeId,
          canonicalTopicId: fixtureTopicId,
          matchMethod: "manual",
          coverageScore: 0.5,
        })
        .catch((e) => e);
      expect(pgCode(err)).toBe("23514");
    });

    // 11. Junction coverage_score must be in [0,1].
    it("rejects coverage_score = 1.1 (ect_coverage_score_range)", async () => {
      const err = await db
        .insert(episodeCanonicalTopics)
        .values({
          episodeId: fixtureEpisodeId,
          canonicalTopicId: fixtureTopicId,
          matchMethod: "auto",
          coverageScore: 1.1,
        })
        .catch((e) => e);
      expect(pgCode(err)).toBe("23514");
    });

    // 12a. Junction similarity_to_top_match = -0.5 is rejected.
    it("rejects similarity_to_top_match = -0.5 (ect_similarity_range)", async () => {
      const err = await db
        .insert(episodeCanonicalTopics)
        .values({
          episodeId: fixtureEpisodeId,
          canonicalTopicId: fixtureTopicId,
          matchMethod: "auto",
          coverageScore: 0.5,
          similarityToTopMatch: -0.5,
        })
        .catch((e) => e);
      expect(pgCode(err)).toBe("23514");
    });

    // 12b. Junction similarity_to_top_match = NULL is accepted.
    it("accepts similarity_to_top_match = NULL (ect_similarity_range nullable)", async () => {
      const [row] = await db
        .insert(episodeCanonicalTopics)
        .values({
          episodeId: fixtureEpisodeId,
          canonicalTopicId: fixtureTopicId,
          matchMethod: "new",
          coverageScore: 0.8,
          similarityToTopMatch: null,
        })
        .returning({ id: episodeCanonicalTopics.id });
      expect(row.id).toBeTypeOf("number");
    });
  },
);
