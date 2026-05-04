// @vitest-environment node
// Real-DB integration test for generate-topic-digest task.
// Requires a live DATABASE_URL — skipped in CI (no DATABASE_URL set).
// Run locally: doppler run -- bun run test src/trigger/__tests__/generate-topic-digest.integration.test.ts

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { createTriggerSdkMock } from "@/test/mocks/trigger-sdk";

// Mock Trigger.dev SDK so task() echoes config (gives us .run) while keeping
// real DB access. AbortTaskRunError comes from the shared factory — it's a real
// class since the task throws it.
vi.mock("@trigger.dev/sdk", () =>
  createTriggerSdkMock({
    metadata: { root: { increment: vi.fn() }, set: vi.fn() },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }),
);

// Mock LLM (no API cost in integration tests)
const mockGenerateCompletion = vi.fn().mockResolvedValue(
  JSON.stringify({
    consensus_points: [
      "All episodes agree on point A",
      "All episodes agree on point B",
      "All episodes agree on point C",
    ],
    disagreement_points: ["Episodes 1 and 2 disagree on X"],
    digest_markdown:
      "This is a valid integration test digest markdown paragraph.",
  }),
);
vi.mock("@/lib/ai", () => ({
  generateCompletion: (...args: unknown[]) => mockGenerateCompletion(...args),
}));

// Mock AI config (no DB read for config in integration scope)
vi.mock("@/lib/ai/config", () => ({
  getActiveAiConfig: vi
    .fn()
    .mockResolvedValue({ model: "test-model-integration" }),
}));

import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  canonicalTopics,
  canonicalTopicDigests,
  episodes,
  episodeCanonicalTopics,
  podcasts,
} from "@/db/schema";
import { STABLE_EMBEDDING as EMBEDDING } from "@/test/embeddings";
import { asPodcastIndexEpisodeId } from "@/types/ids";
import { generateTopicDigest } from "@/trigger/generate-topic-digest";
import type {
  GenerateTopicDigestPayload,
  GenerateTopicDigestResult,
} from "@/trigger/generate-topic-digest";

const taskConfig = generateTopicDigest as unknown as {
  run: (
    payload: GenerateTopicDigestPayload,
  ) => Promise<GenerateTopicDigestResult>;
};

const LABEL_PREFIX = "__digest_int_test_";

let fixtureCanonicalId: number;
let fixtureEpisodeIds: number[] = [];
let fixturePodcastId: number;

describe.skipIf(!process.env.DATABASE_URL)(
  "generate-topic-digest integration",
  () => {
    beforeAll(async () => {
      // Seed a podcast (required FK for episodes). `podcasts.podcastIndexId`
      // is plain text — no brand cast needed.
      const [podcast] = await db
        .insert(podcasts)
        .values({
          podcastIndexId: `${LABEL_PREFIX}podcast_001`,
          title: `${LABEL_PREFIX}Test Podcast`,
        })
        .returning({ id: podcasts.id });
      fixturePodcastId = podcast.id;

      // Seed a canonical topic
      const [canonical] = await db
        .insert(canonicalTopics)
        .values({
          label: `${LABEL_PREFIX}Creatine Research`,
          normalizedLabel: `${LABEL_PREFIX}creatine research`,
          kind: "concept",
          status: "active",
          summary: "Research on creatine supplementation effects on cognition.",
          ongoing: false,
          relevance: 0.8,
          identityEmbedding: EMBEDDING,
          contextEmbedding: EMBEDDING,
        })
        .returning({ id: canonicalTopics.id });
      fixtureCanonicalId = canonical.id;

      // Seed 5 episodes with summaries and varying coverage scores. The task
      // filters by `summaryStatus = 'completed'` (added to defend against
      // mid-resummarize digests reading stale text), so seed that explicitly.
      const episodeValues = Array.from({ length: 5 }, (_, i) => ({
        podcastId: fixturePodcastId,
        podcastIndexId: asPodcastIndexEpisodeId(`${LABEL_PREFIX}ep_${i + 1}`),
        title: `${LABEL_PREFIX}Episode ${i + 1}`,
        summary: `Integration test summary for episode ${i + 1}. Creatine is discussed here with detail ${i}.`,
        summaryStatus: "completed" as const,
      }));

      const insertedEpisodes = await db
        .insert(episodes)
        .values(episodeValues)
        .returning({ id: episodes.id });
      fixtureEpisodeIds = insertedEpisodes.map((e) => e.id);

      // Link episodes to canonical topic with varying coverage scores
      const junctionValues = fixtureEpisodeIds.map((episodeId, i) => ({
        episodeId,
        canonicalTopicId: fixtureCanonicalId,
        matchMethod: "auto" as const,
        coverageScore: 0.9 - i * 0.1, // descending: 0.9, 0.8, 0.7, 0.6, 0.5
      }));
      await db.insert(episodeCanonicalTopics).values(junctionValues);
    });

    afterAll(async () => {
      // Cascade delete via canonical_topics label prefix (FK ON DELETE CASCADE handles digest + junction)
      await db.execute(
        sql`DELETE FROM canonical_topics WHERE starts_with(label, ${LABEL_PREFIX})`,
      );
      // Also clean up episodes (no cascade from canonical_topics to episodes)
      await db.execute(
        sql`DELETE FROM episodes WHERE title LIKE ${LABEL_PREFIX + "%"}`,
      );
      await db.execute(
        sql`DELETE FROM podcasts WHERE podcast_index_id LIKE ${LABEL_PREFIX + "%"}`,
      );
    });

    it("generates and persists digest with correct episode_count_at_generation and episode_ids", async () => {
      const result = await taskConfig.run({
        canonicalTopicId: fixtureCanonicalId,
      });

      expect(result.status).toBe("generated");
      expect(result.episodeCount).toBe(5);
      expect(result.modelUsed).toBe("test-model-integration");

      // Verify persisted row
      const rows = await db
        .select()
        .from(canonicalTopicDigests)
        .where(sql`canonical_topic_id = ${fixtureCanonicalId}`);

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row.episodeCountAtGeneration).toBe(5);
      expect(row.episodeIds).toHaveLength(5);
      // All fixture episode IDs should be in the persisted list
      for (const epId of fixtureEpisodeIds) {
        expect(row.episodeIds).toContain(epId);
      }
      // Episode IDs should be ordered by coverage score DESC (0.9 highest)
      const firstEpId = fixtureEpisodeIds[0]; // highest coverage (0.9)
      expect(row.episodeIds[0]).toBe(firstEpId);
      expect(row.consensusPoints).toHaveLength(3);
      expect(row.disagreementPoints).toHaveLength(1);
      expect(row.digestMarkdown).toBeTruthy();
      expect(row.modelUsed).toBe("test-model-integration");
      expect(row.generatedAt).toBeInstanceOf(Date);
    });

    it("rate guard prevents duplicate write within 1h window", async () => {
      // Re-running immediately should be caught by the task-layer rate guard
      // (generated_at < 1h). No UPSERT, no new LLM call consumed.
      const result = await taskConfig.run({
        canonicalTopicId: fixtureCanonicalId,
      });

      expect(result.status).toBe("rate_guarded");

      // Confirm still exactly one row.
      const rows = await db.execute<{ count: number }>(
        sql`SELECT COUNT(*)::int AS count FROM canonical_topic_digests WHERE canonical_topic_id = ${fixtureCanonicalId}`,
      );
      expect(rows.rows[0].count).toBe(1);
    });

    it("UPSERT on re-run after rate-guard window: updates existing row without creating duplicates", async () => {
      // Push the existing digest's generatedAt back >1h so the rate guard
      // releases. Now a re-run should hit UPSERT and overwrite, not insert.
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await db
        .update(canonicalTopicDigests)
        .set({ generatedAt: twoHoursAgo })
        .where(eq(canonicalTopicDigests.canonicalTopicId, fixtureCanonicalId));

      mockGenerateCompletion.mockResolvedValueOnce(
        JSON.stringify({
          consensus_points: ["Updated A", "Updated B", "Updated C"],
          disagreement_points: [],
          digest_markdown: "Updated digest markdown for re-run test.",
        }),
      );

      const result = await taskConfig.run({
        canonicalTopicId: fixtureCanonicalId,
      });

      expect(result.status).toBe("generated");

      // Persisted row reflects the new mocked output AND there's still only one.
      const rows = await db
        .select()
        .from(canonicalTopicDigests)
        .where(sql`canonical_topic_id = ${fixtureCanonicalId}`);

      expect(rows).toHaveLength(1);
      expect(rows[0].consensusPoints).toEqual([
        "Updated A",
        "Updated B",
        "Updated C",
      ]);
      expect(rows[0].digestMarkdown).toBe(
        "Updated digest markdown for re-run test.",
      );

      const countRows = await db.execute<{ count: number }>(
        sql`SELECT COUNT(*)::int AS count FROM canonical_topic_digests WHERE canonical_topic_id = ${fixtureCanonicalId}`,
      );
      expect(countRows.rows[0].count).toBe(1);
    });
  },
);
