// @vitest-environment node
// Integration smoke tests for canonical-topic-digests schema constraints.
// Requires a live DATABASE_URL — skipped in CI (no DATABASE_URL set).
// Run locally: doppler run -- bun run test src/db/__tests__/canonical-topic-digests.schema.test.ts

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { canonicalTopics, canonicalTopicDigests } from "@/db/schema";
import { EMBEDDING_DIMENSION } from "@/lib/ai/embed-constants";
import { expectInsertRejects } from "@/db/__tests__/schema-test-helpers";

// Stable fixture embedding — content irrelevant for constraint tests.
const EMBEDDING = Array.from({ length: EMBEDDING_DIMENSION }, () => 0.001);

// Base row that satisfies every constraint (happy path).
const validDigest = {
  digestMarkdown: "__schema_test_digest_markdown",
  consensusPoints: ["point one", "point two"],
  disagreementPoints: ["disagree one"],
  episodeIds: [1, 2, 3],
  episodeCountAtGeneration: 3,
  modelUsed: "claude-sonnet-4-6",
};

let fixtureTopicId: number;

describe.skipIf(!process.env.DATABASE_URL)(
  "canonical-topic-digests schema constraints",
  () => {
    beforeAll(async () => {
      // Insert a stable canonical_topic fixture to FK against.
      const [topic] = await db
        .insert(canonicalTopics)
        .values({
          label: "__schema_test_digest_fixture",
          normalizedLabel: "__schema_test_digest_fixture",
          kind: "concept",
          status: "active",
          summary: "__schema_test_summary",
          ongoing: false,
          relevance: 0.5,
          episodeCount: 3,
          identityEmbedding: EMBEDDING,
          contextEmbedding: EMBEDDING,
        })
        .returning({ id: canonicalTopics.id });
      fixtureTopicId = topic.id;
    });

    afterAll(async () => {
      // Deleting the parent canonical_topics row cascades digest cleanup
      // via the FK ON DELETE CASCADE.
      await db.execute(
        sql`DELETE FROM canonical_topics WHERE starts_with(label, '__schema_test_digest_')`,
      );
    });

    afterEach(async () => {
      await db.execute(
        sql`DELETE FROM canonical_topic_digests WHERE canonical_topic_id IN (SELECT id FROM canonical_topics WHERE starts_with(label, '__schema_test_digest_'))`,
      );
    });

    // Round-trips every column to guard against silent column-drop, jsonb
    // shape drift (e.g. an accidental double-stringify), or default drift.
    it("inserts a fully-valid digest row and round-trips every column", async () => {
      const [row] = await db
        .insert(canonicalTopicDigests)
        .values({ ...validDigest, canonicalTopicId: fixtureTopicId })
        .returning();
      expect(row.id).toBeTypeOf("number");
      expect(row.canonicalTopicId).toBe(fixtureTopicId);
      expect(row.digestMarkdown).toBe(validDigest.digestMarkdown);
      expect(row.consensusPoints).toEqual(validDigest.consensusPoints);
      expect(row.disagreementPoints).toEqual(validDigest.disagreementPoints);
      expect(row.episodeIds).toEqual(validDigest.episodeIds);
      expect(row.episodeCountAtGeneration).toBe(
        validDigest.episodeCountAtGeneration,
      );
      expect(row.modelUsed).toBe(validDigest.modelUsed);
      expect(row.generatedAt).toBeInstanceOf(Date);
    });

    it("accepts episode_count_at_generation = 0 (inclusive lower bound)", async () => {
      const [row] = await db
        .insert(canonicalTopicDigests)
        .values({
          ...validDigest,
          canonicalTopicId: fixtureTopicId,
          episodeCountAtGeneration: 0,
          episodeIds: [],
        })
        .returning();
      expect(row.episodeCountAtGeneration).toBe(0);
    });

    it("rejects a second digest for the same canonical_topic_id (ctd_canonical_topic_uidx)", async () => {
      await db
        .insert(canonicalTopicDigests)
        .values({ ...validDigest, canonicalTopicId: fixtureTopicId });

      await expectInsertRejects(
        db
          .insert(canonicalTopicDigests)
          .values({ ...validDigest, canonicalTopicId: fixtureTopicId }),
        "23505",
        "ctd_canonical_topic_uidx",
      );
    });

    it("rejects episode_count_at_generation = -1 (ctd_episode_count_gte_0)", async () => {
      await expectInsertRejects(
        db.insert(canonicalTopicDigests).values({
          ...validDigest,
          canonicalTopicId: fixtureTopicId,
          episodeCountAtGeneration: -1,
        }),
        "23514",
        "ctd_episode_count_gte_0",
      );
    });

    it("cascades digest deletion when the parent canonical_topic is deleted", async () => {
      const [tmp] = await db
        .insert(canonicalTopics)
        .values({
          label: "__schema_test_digest_cascade",
          normalizedLabel: "__schema_test_digest_cascade",
          kind: "concept",
          status: "active",
          summary: "__schema_test_summary",
          ongoing: false,
          relevance: 0.5,
          episodeCount: 1,
          identityEmbedding: EMBEDDING,
          contextEmbedding: EMBEDDING,
        })
        .returning({ id: canonicalTopics.id });
      await db
        .insert(canonicalTopicDigests)
        .values({ ...validDigest, canonicalTopicId: tmp.id });

      await db.execute(sql`DELETE FROM canonical_topics WHERE id = ${tmp.id}`);

      const remaining = await db.execute<{ count: number }>(
        sql`SELECT COUNT(*)::int AS count FROM canonical_topic_digests WHERE canonical_topic_id = ${tmp.id}`,
      );
      expect(remaining.rows[0].count).toBe(0);
    });
  },
);
