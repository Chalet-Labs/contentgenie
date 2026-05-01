// @vitest-environment node
// DB-gated integration test for insertJunction's ON CONFLICT DO UPDATE
// behavior. Verifies last-write-wins on the metric fields when the same
// (episode_id, canonical_topic_id) pair is inserted twice — required for
// observability accuracy on retries and recovery-path re-resolutions.
// Skipped when DATABASE_URL is unset (CI).
// Run locally: doppler run -- bun run test src/lib/__tests__/insert-junction.integration.test.ts

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { transactional } from "@/db/pool";
import { insertJunction, type Tx } from "@/lib/entity-resolution";
import { EMBEDDING_DIMENSION, EMBEDDING_MODEL } from "@/lib/ai/embed-constants";

const TEST_PREFIX = "__ij_upsert_test_";
const STABLE_EMBEDDING = Array.from(
  { length: EMBEDDING_DIMENSION },
  () => 0.001,
);

async function cleanup(): Promise<void> {
  await db.execute(
    sql`DELETE FROM episode_canonical_topics WHERE canonical_topic_id IN (SELECT id FROM canonical_topics WHERE starts_with(label, ${TEST_PREFIX}))`,
  );
  await db.execute(
    sql`DELETE FROM canonical_topics WHERE starts_with(label, ${TEST_PREFIX})`,
  );
}

describe.skipIf(!process.env.DATABASE_URL)(
  "insertJunction — ON CONFLICT DO UPDATE",
  () => {
    let episodeId: number;
    let canonicalId: number;

    beforeAll(async () => {
      await cleanup();
      const ep = await db.execute<{ id: number }>(
        sql`SELECT id FROM episodes ORDER BY id LIMIT 1`,
      );
      if (ep.rows.length < 1) {
        throw new Error("Need at least 1 episode seeded in the dev DB.");
      }
      episodeId = ep.rows[0].id;

      const ct = await db.execute<{ id: number }>(
        sql`INSERT INTO canonical_topics
              (label, normalized_label, kind, summary, ongoing, relevance,
               identity_embedding, context_embedding, embedding_model_version)
            VALUES (${TEST_PREFIX + "a"}, ${TEST_PREFIX + "a"}, 'concept', 'test', false, 0.5,
                    ${`[${STABLE_EMBEDDING.join(",")}]`}::vector,
                    ${`[${STABLE_EMBEDDING.join(",")}]`}::vector,
                    ${EMBEDDING_MODEL})
            RETURNING id`,
      );
      canonicalId = ct.rows[0].id;
    });

    afterAll(async () => {
      await cleanup();
    });

    it("upserts metric fields on (episode_id, canonical_topic_id) collision", async () => {
      // First write: 'auto' / forced=false / similarity=0.42
      await transactional<void>(async (tx) => {
        await insertJunction(tx as unknown as Tx, {
          episodeId,
          canonicalId,
          matchMethod: "auto",
          similarity: 0.42,
          coverageScore: 0.5,
          versionTokenForcedDisambig: false,
        });
      });

      const after1 = await db.execute<{
        match_method: string;
        similarity_to_top_match: number | null;
        coverage_score: number;
        version_token_forced_disambig: boolean;
        created_at: string;
        updated_at: string;
      }>(
        sql`SELECT match_method, similarity_to_top_match, coverage_score, version_token_forced_disambig, created_at, updated_at
            FROM episode_canonical_topics
            WHERE episode_id = ${episodeId} AND canonical_topic_id = ${canonicalId}`,
      );
      expect(after1.rows[0]).toMatchObject({
        match_method: "auto",
        version_token_forced_disambig: false,
      });
      expect(after1.rows[0].similarity_to_top_match).toBeCloseTo(0.42, 6);
      const createdAt1 = new Date(after1.rows[0].created_at).getTime();
      const updatedAt1 = new Date(after1.rows[0].updated_at).getTime();

      // Wait briefly so the second now() is observably later than the first.
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Second write: 'llm_disambig' / forced=true / similarity=0.88
      await transactional<void>(async (tx) => {
        await insertJunction(tx as unknown as Tx, {
          episodeId,
          canonicalId,
          matchMethod: "llm_disambig",
          similarity: 0.88,
          coverageScore: 0.7,
          versionTokenForcedDisambig: true,
        });
      });

      const after2 = await db.execute<{
        match_method: string;
        similarity_to_top_match: number | null;
        coverage_score: number;
        version_token_forced_disambig: boolean;
        created_at: string;
        updated_at: string;
      }>(
        sql`SELECT match_method, similarity_to_top_match, coverage_score, version_token_forced_disambig, created_at, updated_at
            FROM episode_canonical_topics
            WHERE episode_id = ${episodeId} AND canonical_topic_id = ${canonicalId}`,
      );

      // Last-write-wins: all four metric fields reflect the second insert.
      expect(after2.rows[0]).toMatchObject({
        match_method: "llm_disambig",
        version_token_forced_disambig: true,
      });
      expect(after2.rows[0].similarity_to_top_match).toBeCloseTo(0.88, 6);
      expect(Number(after2.rows[0].coverage_score)).toBeCloseTo(0.7, 6);

      // created_at is preserved (PK/insert-only), updated_at advances on conflict
      // — required so the rolling-window dashboard cards count re-resolutions.
      const createdAt2 = new Date(after2.rows[0].created_at).getTime();
      const updatedAt2 = new Date(after2.rows[0].updated_at).getTime();
      expect(createdAt2).toBe(createdAt1);
      expect(updatedAt2).toBeGreaterThan(updatedAt1);

      // Still exactly one row for (episode_id, canonical_topic_id).
      const count = await db.execute<{ count: string }>(
        sql`SELECT count(*)::text AS count FROM episode_canonical_topics
            WHERE episode_id = ${episodeId} AND canonical_topic_id = ${canonicalId}`,
      );
      expect(count.rows[0].count).toBe("1");
    });
  },
);
