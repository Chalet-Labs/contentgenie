// @vitest-environment node
// Regression test for issue #419: canonical_topics.episode_count counter is
// never bumped by the resolver path (insertJunction). After inserting a
// junction row the read-side query must return episodeCount === 1.
//
// Requires a live DATABASE_URL — skipped in CI (no DATABASE_URL set).
// Run locally: doppler run -- bun run test src/lib/admin/__tests__/topic-queries-episode-count.regression.test.ts

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { canonicalTopics } from "@/db/schema";
import { transactional } from "@/db/pool";
import { insertJunction } from "@/lib/entity-resolution";
import { getCanonicalTopicsListQuery } from "@/lib/admin/topic-queries";
import { EMBEDDING_DIMENSION } from "@/lib/ai/embed-constants";

const EMBEDDING = Array.from({ length: EMBEDDING_DIMENSION }, () => 0.001);
const LABEL_PREFIX = "__regression_419_";

let fixtureEpisodeId: number;
let fixtureTopicId: number;

describe.skipIf(!process.env.DATABASE_URL)(
  "issue #419 regression: episodeCount reflects actual junction rows",
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

      const [topic] = await db
        .insert(canonicalTopics)
        .values({
          label: `${LABEL_PREFIX}topic`,
          normalizedLabel: `${LABEL_PREFIX}topic`,
          kind: "concept",
          summary: "Regression fixture for issue #419",
          ongoing: false,
          relevance: 0.5,
          episodeCount: 0,
          identityEmbedding: EMBEDDING,
          contextEmbedding: EMBEDDING,
        })
        .returning({ id: canonicalTopics.id });
      fixtureTopicId = topic.id;
    });

    afterAll(async () => {
      await db.execute(
        sql`DELETE FROM episode_canonical_topics WHERE canonical_topic_id = ${fixtureTopicId}`,
      );
      await db.execute(
        sql`DELETE FROM canonical_topics WHERE starts_with(label, ${LABEL_PREFIX})`,
      );
    });

    it("episodeCount === 1 after insertJunction inserts one junction row", async () => {
      // Call insertJunction via a real transaction — mirrors the resolver path.
      await transactional(async (tx) => {
        await insertJunction(tx as never, {
          episodeId: fixtureEpisodeId,
          canonicalId: fixtureTopicId,
          matchMethod: "auto",
          similarity: 0.95,
          coverageScore: 0.8,
        });
      });

      // Read back via the admin query selector that surfaces episodeCount to UI.
      const { rows } = await getCanonicalTopicsListQuery({ page: 1 });
      const row = rows.find((r) => r.id === fixtureTopicId);

      expect(row).toBeDefined();
      // On current main this assertion FAILS: episodeCount is still 0 because
      // insertJunction never bumps canonical_topics.episode_count.
      expect(row!.episodeCount).toBe(1);
    });
  },
);
