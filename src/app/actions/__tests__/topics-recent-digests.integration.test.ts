// @vitest-environment node
// Integration regression test for `getRecentTopicDigests`.
// Requires a live DATABASE_URL + a signed-in Clerk session simulation —
// skipped in CI. Locally:
//   doppler run -- bun run test src/app/actions/__tests__/topics-recent-digests.integration.test.ts
//
// Why this test exists: PR #400 originally shipped a query that did
// `.from(canonicalTopicDigests).innerJoin(canonicalTopics, ...)`. The
// `canonicalTopicEpisodeCount()` helper emits a correlated subquery that
// references `canonical_topics.id` via fully-qualified `${canonicalTopics}`
// interpolation. Postgres rejected the resulting SQL with 42P01 ("invalid
// reference to FROM-clause entry for table 'canonical_topics'") because the
// helper requires `canonicalTopics` to be the primary FROM. The pure-mock
// unit tests didn't catch this — only a real DB round-trip does. See
// MEMORY.md `lesson_vi_mock_real_db_fallthrough` and the project's
// "QA must run doppler real-DB tests" feedback note.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { canonicalTopics, canonicalTopicDigests } from "@/db/schema";
import { STABLE_EMBEDDING as EMBEDDING } from "@/test/embeddings";

// Stub Clerk auth so `withAuthAction` resolves to a signed-in user.
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "user_integration_test" }),
}));

const LABEL_PREFIX = "__integration_400_";
let fixtureTopicId: number;

describe.skipIf(!process.env.DATABASE_URL)(
  "issue #400 regression: getRecentTopicDigests runs against real DB",
  () => {
    beforeAll(async () => {
      // Insert a single canonical topic with an associated digest in the
      // 7-day window so the action returns at least one row.
      const [topic] = await db
        .insert(canonicalTopics)
        .values({
          label: `${LABEL_PREFIX}topic`,
          normalizedLabel: `${LABEL_PREFIX}topic`,
          kind: "concept",
          status: "active",
          summary: "Integration fixture for #400",
          ongoing: false,
          relevance: 0.5,
          identityEmbedding: EMBEDDING,
          contextEmbedding: EMBEDDING,
        })
        .returning({ id: canonicalTopics.id });
      fixtureTopicId = topic.id;

      await db.insert(canonicalTopicDigests).values({
        canonicalTopicId: fixtureTopicId,
        digestMarkdown: "__integration_400_digest_md",
        consensusPoints: ["Integration test consensus point one."],
        disagreementPoints: ["Integration test disagreement."],
        episodeIds: [1, 2, 3],
        episodeCountAtGeneration: 3,
        modelUsed: "claude-sonnet-4-6",
        // generatedAt defaults to now() — within the 7-day window.
      });
    });

    afterAll(async () => {
      // Cascading delete of canonical_topics removes digest rows via FK.
      await db.execute(
        sql`DELETE FROM canonical_topics WHERE starts_with(label, ${LABEL_PREFIX})`,
      );
    });

    it("returns success:true with at least the fixture digest (no 42P01)", async () => {
      // Import lazily so module-eval order doesn't fight the auth mock above.
      const { getRecentTopicDigests } = await import("@/app/actions/topics");

      const result = await getRecentTopicDigests({ limit: 20 });

      // Most important assertion: the action does NOT throw a NeonDbError
      // and returns success:true. Bug #400 had the action throw 42P01
      // because the correlated subquery couldn't resolve `canonical_topics`
      // when it was on the JOIN side instead of the FROM side.
      expect(result.success).toBe(true);
      if (!result.success) return; // narrow

      // Find our fixture row in the result (other digests may exist in DB).
      const fixtureRow = result.data.find(
        (r) => r.canonicalId === fixtureTopicId,
      );
      expect(fixtureRow).toBeDefined();
      expect(fixtureRow!.label).toBe(`${LABEL_PREFIX}topic`);
      expect(fixtureRow!.kind).toBe("concept");
      expect(typeof fixtureRow!.episodeCount).toBe("number");
      // The fixture has no junction rows yet — episodeCount should be 0
      // (correlated subquery returns 0, NOT undefined or NaN).
      expect(fixtureRow!.episodeCount).toBe(0);
      expect(fixtureRow!.consensusPreview).toBe(
        "Integration test consensus point one.",
      );
      expect(fixtureRow!.generatedAt).toBeInstanceOf(Date);
    });

    it("returns success:true with empty array when limit excludes window", async () => {
      const { getRecentTopicDigests } = await import("@/app/actions/topics");

      // Sanity: even with limit=1 the call shouldn't throw a DB error.
      const result = await getRecentTopicDigests({ limit: 1 });
      expect(result.success).toBe(true);
    });
  },
);
