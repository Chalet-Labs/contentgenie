// @vitest-environment node
// Integration smoke tests for canonical-topic-digests schema constraints.
// Requires a live DATABASE_URL — skipped in CI (no DATABASE_URL set).
// Run locally: doppler run -- bun run test src/db/__tests__/canonical-topic-digests.schema.test.ts

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { canonicalTopics, canonicalTopicDigests } from "@/db/schema";
import { EMBEDDING_DIMENSION } from "@/lib/ai/embed-constants";

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

// Helper: look for a Postgres SQLSTATE code on the thrown error.
// The Neon HTTP driver wraps the NeonDbError in `err.cause` rather than
// surfacing it directly on the thrown object.
function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
}

// Helper: pull the violated constraint name out of a Postgres error so
// individual constraint tests can pin to the specific check, not just the
// SQLSTATE class.
function pgConstraint(err: unknown): string | undefined {
  const e = err as { constraint?: string; cause?: { constraint?: string } };
  return e?.cause?.constraint ?? e?.constraint;
}

// Wrap an insert/update promise and assert it rejects with the given SQLSTATE
// (and optional constraint name). Centralises the awkward `.catch((e) => e)`
// pattern so each constraint test reads as a single expectation.
async function expectInsertRejects(
  insertPromise: Promise<unknown>,
  sqlstate: "23514" | "23505",
  constraint?: string,
) {
  const err = await insertPromise.catch((e: unknown) => e);
  expect(pgCode(err)).toBe(sqlstate);
  if (constraint) expect(pgConstraint(err)).toBe(constraint);
}

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
      await db.execute(
        sql`DELETE FROM canonical_topic_digests WHERE canonical_topic_id IN (SELECT id FROM canonical_topics WHERE starts_with(label, '__schema_test_'))`,
      );
      await db.execute(
        sql`DELETE FROM canonical_topics WHERE starts_with(label, '__schema_test_')`,
      );
    });

    afterEach(async () => {
      await db.execute(
        sql`DELETE FROM canonical_topic_digests WHERE canonical_topic_id IN (SELECT id FROM canonical_topics WHERE starts_with(label, '__schema_test_'))`,
      );
    });

    // 1. Happy path — guard against silent column-drop / default drift.
    it("inserts a fully-valid digest row with expected defaults", async () => {
      const [row] = await db
        .insert(canonicalTopicDigests)
        .values({ ...validDigest, canonicalTopicId: fixtureTopicId })
        .returning();
      expect(row.id).toBeTypeOf("number");
      expect(row.generatedAt).toBeTruthy();
    });

    // 2. UNIQUE constraint — one digest per canonical topic.
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

    // 3. CHECK constraint — episode_count_at_generation must be >= 0.
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
  },
);
