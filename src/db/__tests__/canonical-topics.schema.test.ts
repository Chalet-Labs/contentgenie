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
import {
  EMBEDDING_DIMENSION as EMBEDDING_DIM,
  EMBEDDING_MODEL,
} from "@/lib/ai/embed-constants";
import { expectInsertRejects } from "@/db/__tests__/schema-test-helpers";

// Stable 1024-dim fixture — content irrelevant for constraint tests.
const EMBEDDING = Array.from({ length: EMBEDDING_DIM }, () => 0.001);

// Base row that satisfies every constraint (happy path).
const validTopic = {
  label: "__schema_test_valid",
  normalizedLabel: "__schema_test_valid",
  kind: "concept" as const,
  status: "active" as const,
  summary: "__schema_test_summary",
  ongoing: false,
  relevance: 0.5,
  identityEmbedding: EMBEDDING,
  contextEmbedding: EMBEDDING,
  embeddingModelVersion: EMBEDDING_MODEL,
};

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
      // Underscores are LIKE wildcards — use starts_with for a literal-prefix match
      // so cleanup never collides with unrelated rows on a shared dev DB.
      await db.execute(
        sql`DELETE FROM canonical_topic_aliases WHERE canonical_topic_id IN (SELECT id FROM canonical_topics WHERE starts_with(label, '__schema_test_'))`,
      );
      await db.execute(
        sql`DELETE FROM canonical_topics WHERE starts_with(label, '__schema_test_')`,
      );
    });

    afterEach(async () => {
      // Remove any test rows inserted mid-test. Aliases attached to the
      // long-lived fixture topic are cleaned out too so alias-uniqueness
      // tests can re-use the same alias text without leaking into the
      // next case.
      await db.execute(
        sql`DELETE FROM canonical_topic_aliases WHERE canonical_topic_id IN (SELECT id FROM canonical_topics WHERE starts_with(label, '__schema_test_'))`,
      );
      await db.execute(
        sql`DELETE FROM canonical_topics WHERE starts_with(label, '__schema_test_') AND label != '__schema_test_fixture'`,
      );
      await db.execute(
        sql`DELETE FROM episode_canonical_topics WHERE episode_id = ${fixtureEpisodeId} AND canonical_topic_id = ${fixtureTopicId}`,
      );
    });

    // Happy path — guard against silent schema drift on the basic insert path,
    // including the column defaults that aren't explicitly set in `validTopic`.
    it("inserts a fully-valid canonical_topic row with expected defaults", async () => {
      // Use a row that omits status / ongoing /
      // embeddingModelVersion so the DB defaults flow through.
      const [row] = await db
        .insert(canonicalTopics)
        .values({
          label: "__schema_test_happy_path",
          normalizedLabel: "__schema_test_happy_path",
          kind: "concept",
          summary: "__schema_test_summary",
          relevance: 0.5,
          identityEmbedding: EMBEDDING,
          contextEmbedding: EMBEDDING,
        })
        .returning();
      expect(row.id).toBeTypeOf("number");
      expect(row.status).toBe("active");
      expect(row.ongoing).toBe(false);
      expect(row.embeddingModelVersion).toBe(EMBEDDING_MODEL);
    });

    // 1. Biconditional direction A — merged with NULL target is rejected.
    it("rejects status=merged with merged_into_id=NULL (ct_merged_biconditional A)", async () => {
      await expectInsertRejects(
        db.insert(canonicalTopics).values({
          ...validTopic,
          label: "__schema_test_bicond_a",
          status: "merged",
          mergedIntoId: null,
        }),
        "23514",
        "ct_merged_biconditional",
      );
    });

    // 2. Biconditional direction B — any non-merged status with a target id is
    //    rejected (the constraint covers active *and* dormant equally).
    it("rejects status<>'merged' with merged_into_id set (ct_merged_biconditional B)", async () => {
      await expectInsertRejects(
        db.insert(canonicalTopics).values({
          ...validTopic,
          label: "__schema_test_bicond_b",
          status: "active",
          mergedIntoId: fixtureTopicId,
        }),
        "23514",
        "ct_merged_biconditional",
      );
    });

    // 3. Self-merge ban — UPDATE to point merged_into_id at own id.
    it("rejects setting merged_into_id = id (ct_no_self_merge)", async () => {
      const [row] = await db
        .insert(canonicalTopics)
        .values({ ...validTopic, label: "__schema_test_self_merge" })
        .returning({ id: canonicalTopics.id });

      await expectInsertRejects(
        db.execute(
          sql`UPDATE canonical_topics SET status = 'merged', merged_into_id = ${row.id} WHERE id = ${row.id}`,
        ),
        "23514",
        "ct_no_self_merge",
      );
    });

    // 4. Relevance below 0.
    it("rejects relevance = -0.1 (ct_relevance_range)", async () => {
      await expectInsertRejects(
        db.insert(canonicalTopics).values({
          ...validTopic,
          label: "__schema_test_rel_low",
          relevance: -0.1,
        }),
        "23514",
        "ct_relevance_range",
      );
    });

    // 5. Relevance above 1.
    it("rejects relevance = 1.5 (ct_relevance_range)", async () => {
      await expectInsertRejects(
        db.insert(canonicalTopics).values({
          ...validTopic,
          label: "__schema_test_rel_high",
          relevance: 1.5,
        }),
        "23514",
        "ct_relevance_range",
      );
    });

    // 7. Blank label (whitespace only).
    it("rejects label = '   ' (ct_label_not_blank)", async () => {
      await expectInsertRejects(
        db.insert(canonicalTopics).values({ ...validTopic, label: "   " }),
        "23514",
        "ct_label_not_blank",
      );
    });

    // 7b. Blank normalizedLabel (whitespace only) — guards the active uniqueness key.
    it("rejects normalizedLabel = '   ' (ct_normalized_label_not_blank)", async () => {
      await expectInsertRejects(
        db.insert(canonicalTopics).values({
          ...validTopic,
          label: "__schema_test_blank_norm",
          normalizedLabel: "   ",
        }),
        "23514",
        "ct_normalized_label_not_blank",
      );
    });

    // 8. Blank summary (empty string).
    it("rejects summary = '' (ct_summary_not_blank)", async () => {
      await expectInsertRejects(
        db.insert(canonicalTopics).values({
          ...validTopic,
          label: "__schema_test_blank_sum",
          summary: "",
        }),
        "23514",
        "ct_summary_not_blank",
      );
    });

    // Boundary positives — make sure inclusive ranges actually allow the edges.
    it("accepts relevance = 0", async () => {
      const [row] = await db
        .insert(canonicalTopics)
        .values({
          ...validTopic,
          label: "__schema_test_rel_zero",
          relevance: 0,
        })
        .returning({ id: canonicalTopics.id });
      expect(row.id).toBeTypeOf("number");
    });

    it("accepts relevance = 1", async () => {
      const [row] = await db
        .insert(canonicalTopics)
        .values({
          ...validTopic,
          label: "__schema_test_rel_one",
          relevance: 1,
        })
        .returning({ id: canonicalTopics.id });
      expect(row.id).toBeTypeOf("number");
    });

    it("accepts coverage_score = 0", async () => {
      const [row] = await db
        .insert(episodeCanonicalTopics)
        .values({
          episodeId: fixtureEpisodeId,
          canonicalTopicId: fixtureTopicId,
          matchMethod: "auto",
          coverageScore: 0,
        })
        .returning({ id: episodeCanonicalTopics.id });
      expect(row.id).toBeTypeOf("number");
    });

    it("accepts coverage_score = 1", async () => {
      const [row] = await db
        .insert(episodeCanonicalTopics)
        .values({
          episodeId: fixtureEpisodeId,
          canonicalTopicId: fixtureTopicId,
          matchMethod: "auto",
          coverageScore: 1,
        })
        .returning({ id: episodeCanonicalTopics.id });
      expect(row.id).toBeTypeOf("number");
    });

    it("accepts similarity_to_top_match = 0", async () => {
      const [row] = await db
        .insert(episodeCanonicalTopics)
        .values({
          episodeId: fixtureEpisodeId,
          canonicalTopicId: fixtureTopicId,
          matchMethod: "auto",
          coverageScore: 0.5,
          similarityToTopMatch: 0,
        })
        .returning({ id: episodeCanonicalTopics.id });
      expect(row.id).toBeTypeOf("number");
    });

    it("accepts similarity_to_top_match = 1", async () => {
      const [row] = await db
        .insert(episodeCanonicalTopics)
        .values({
          episodeId: fixtureEpisodeId,
          canonicalTopicId: fixtureTopicId,
          matchMethod: "auto",
          coverageScore: 0.5,
          similarityToTopMatch: 1,
        })
        .returning({ id: episodeCanonicalTopics.id });
      expect(row.id).toBeTypeOf("number");
    });

    // State machine: walk a topic through active → merged → dormant and assert
    // the FK / status combination round-trips cleanly via the biconditional.
    it("supports active → merged → dormant transitions", async () => {
      const [a] = await db
        .insert(canonicalTopics)
        .values({
          ...validTopic,
          label: "__schema_test_sm_a",
          normalizedLabel: "__schema_test_sm_a",
        })
        .returning({ id: canonicalTopics.id });

      const [b] = await db
        .insert(canonicalTopics)
        .values({
          ...validTopic,
          label: "__schema_test_sm_b",
          normalizedLabel: "__schema_test_sm_b",
        })
        .returning({ id: canonicalTopics.id });

      // active → merged (pointing at A) — must succeed.
      await db.execute(
        sql`UPDATE canonical_topics SET status = 'merged', merged_into_id = ${a.id} WHERE id = ${b.id}`,
      );

      // merged → dormant — clearing merged_into_id must succeed.
      await db.execute(
        sql`UPDATE canonical_topics SET status = 'dormant', merged_into_id = NULL WHERE id = ${b.id}`,
      );

      const after = await db.execute<{
        status: string;
        merged_into_id: number | null;
      }>(
        sql`SELECT status, merged_into_id FROM canonical_topics WHERE id = ${b.id}`,
      );
      expect(after.rows[0].status).toBe("dormant");
      expect(after.rows[0].merged_into_id).toBeNull();
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
      await expectInsertRejects(
        db.insert(canonicalTopics).values({
          ...validTopic,
          label: "__schema_test_puidx_2",
          normalizedLabel: "__schema_test_puidx",
          kind: "concept",
          status: "active",
        }),
        "23505",
        "ct_normalized_label_kind_active_uidx",
      );

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
      await expectInsertRejects(
        db.insert(episodeCanonicalTopics).values({
          episodeId: fixtureEpisodeId,
          canonicalTopicId: fixtureTopicId,
          // 'manual' is not in the enum union; cast just to bypass the
          // TypeScript-side narrowing so the DB constraint is what fails.
          matchMethod: "manual" as unknown as "auto",
          coverageScore: 0.5,
        }),
        "23514",
        "ect_match_method_enum",
      );
    });

    // 11. Junction coverage_score must be in [0,1].
    it("rejects coverage_score = 1.1 (ect_coverage_score_range)", async () => {
      await expectInsertRejects(
        db.insert(episodeCanonicalTopics).values({
          episodeId: fixtureEpisodeId,
          canonicalTopicId: fixtureTopicId,
          matchMethod: "auto",
          coverageScore: 1.1,
        }),
        "23514",
        "ect_coverage_score_range",
      );
    });

    // 12a. Junction similarity_to_top_match = -0.5 is rejected.
    it("rejects similarity_to_top_match = -0.5 (ect_similarity_range)", async () => {
      await expectInsertRejects(
        db.insert(episodeCanonicalTopics).values({
          episodeId: fixtureEpisodeId,
          canonicalTopicId: fixtureTopicId,
          matchMethod: "auto",
          coverageScore: 0.5,
          similarityToTopMatch: -0.5,
        }),
        "23514",
        "ect_similarity_range",
      );
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

    // 13. Junction (episode_id, canonical_topic_id) is unique.
    it("rejects duplicate (episode_id, canonical_topic_id) pair (ect_episode_canonical_uidx)", async () => {
      await db.insert(episodeCanonicalTopics).values({
        episodeId: fixtureEpisodeId,
        canonicalTopicId: fixtureTopicId,
        matchMethod: "auto",
        coverageScore: 0.5,
      });

      await expectInsertRejects(
        db.insert(episodeCanonicalTopics).values({
          episodeId: fixtureEpisodeId,
          canonicalTopicId: fixtureTopicId,
          matchMethod: "auto",
          coverageScore: 0.6,
        }),
        "23505",
        "ect_episode_canonical_uidx",
      );
    });

    // 14. Aliases — unique per (canonical_topic, lower(alias)).
    it("rejects case-insensitive duplicate alias on same canonical (cta_topic_alias_lower_uidx)", async () => {
      await db.insert(canonicalTopicAliases).values({
        canonicalTopicId: fixtureTopicId,
        alias: "AcMe",
      });

      await expectInsertRejects(
        db.insert(canonicalTopicAliases).values({
          canonicalTopicId: fixtureTopicId,
          alias: "acme",
        }),
        "23505",
        "cta_topic_alias_lower_uidx",
      );
    });

    // 15. The same alias text is allowed under a different canonical topic.
    it("allows same alias text under different canonical topics", async () => {
      const [other] = await db
        .insert(canonicalTopics)
        .values({
          ...validTopic,
          label: "__schema_test_alias_other",
          normalizedLabel: "__schema_test_alias_other",
        })
        .returning({ id: canonicalTopics.id });

      const [a1] = await db
        .insert(canonicalTopicAliases)
        .values({ canonicalTopicId: fixtureTopicId, alias: "acme" })
        .returning({ id: canonicalTopicAliases.id });
      const [a2] = await db
        .insert(canonicalTopicAliases)
        .values({ canonicalTopicId: other.id, alias: "acme" })
        .returning({ id: canonicalTopicAliases.id });

      expect(a1.id).toBeTypeOf("number");
      expect(a2.id).toBeTypeOf("number");
    });

    // 16. Aliases must not be blank (whitespace-only).
    it("rejects blank alias (cta_alias_not_blank)", async () => {
      await expectInsertRejects(
        db.insert(canonicalTopicAliases).values({
          canonicalTopicId: fixtureTopicId,
          alias: "   ",
        }),
        "23514",
        "cta_alias_not_blank",
      );
    });
  },
);
