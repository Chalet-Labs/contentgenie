// @vitest-environment node
// Requires DATABASE_URL — skipped in CI. Locally: doppler run -- bun run test <this file>

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

let fixtureEpisodeIds: number[] = [];
let topicAId: number;
let topicBId: number;

describe.skipIf(!process.env.DATABASE_URL)(
  "issue #419 regression: episodeCount reflects actual junction rows",
  () => {
    beforeAll(async () => {
      const rows = await db.execute<{ id: number }>(
        sql`SELECT id FROM episodes ORDER BY id LIMIT 5`,
      );
      if (rows.rows.length < 5) {
        throw new Error(
          "Need at least 5 episode rows in DB to seed regression fixtures.",
        );
      }
      fixtureEpisodeIds = rows.rows.map((r) => r.id);

      const inserted = await db
        .insert(canonicalTopics)
        .values([
          {
            label: `${LABEL_PREFIX}topic_a`,
            normalizedLabel: `${LABEL_PREFIX}topic_a`,
            kind: "concept",
            summary: "Regression fixture A for issue #419",
            ongoing: false,
            relevance: 0.5,
            identityEmbedding: EMBEDDING,
            contextEmbedding: EMBEDDING,
          },
          {
            label: `${LABEL_PREFIX}topic_b`,
            normalizedLabel: `${LABEL_PREFIX}topic_b`,
            kind: "concept",
            summary: "Regression fixture B for issue #419",
            ongoing: false,
            relevance: 0.5,
            identityEmbedding: EMBEDDING,
            contextEmbedding: EMBEDDING,
          },
        ])
        .returning({ id: canonicalTopics.id });
      topicAId = inserted[0].id;
      topicBId = inserted[1].id;
    });

    afterAll(async () => {
      await db.execute(
        sql`DELETE FROM episode_canonical_topics WHERE canonical_topic_id IN (${topicAId}, ${topicBId})`,
      );
      await db.execute(
        sql`DELETE FROM canonical_topics WHERE starts_with(label, ${LABEL_PREFIX})`,
      );
    });

    it("episodeCount projection reflects actual junction rows per topic", async () => {
      // Topic A → 2 junctions; topic B → 3. Different counts catch any
      // regression where the correlated subquery loses outer-row correlation
      // (e.g. dropping the `ect` alias would make every row return the same
      // count).
      await transactional(async (tx) => {
        for (const episodeId of fixtureEpisodeIds.slice(0, 2)) {
          await insertJunction(tx as never, {
            episodeId,
            canonicalId: topicAId,
            matchMethod: "auto",
            similarity: 0.95,
            coverageScore: 0.8,
          });
        }
        for (const episodeId of fixtureEpisodeIds.slice(0, 3)) {
          await insertJunction(tx as never, {
            episodeId,
            canonicalId: topicBId,
            matchMethod: "auto",
            similarity: 0.95,
            coverageScore: 0.8,
          });
        }
      });

      const { rows } = await getCanonicalTopicsListQuery({ page: 1 });
      const rowA = rows.find((r) => r.id === topicAId);
      const rowB = rows.find((r) => r.id === topicBId);

      expect(rowA).toBeDefined();
      expect(rowB).toBeDefined();
      expect(typeof rowA!.episodeCount).toBe("number");
      expect(rowA!.episodeCount).toBe(2);
      expect(rowB!.episodeCount).toBe(3);
    });
  },
);
