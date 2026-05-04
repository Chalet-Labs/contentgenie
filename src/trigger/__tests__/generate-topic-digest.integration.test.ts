// @vitest-environment node
// Real-DB integration test for generate-topic-digest task.
// Requires a live DATABASE_URL — skipped in CI (no DATABASE_URL set).
// Run locally: doppler run -- bun run test src/trigger/__tests__/generate-topic-digest.integration.test.ts

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";

// Mock Trigger.dev SDK so task() echoes config (gives us .run) while keeping
// real DB access. AbortTaskRunError must be a real class since the task throws it.
vi.mock("@trigger.dev/sdk", () => ({
  task: vi.fn((config: unknown) => config),
  AbortTaskRunError: class AbortTaskRunError extends Error {
    constructor(message?: string) {
      super(message);
      this.name = "AbortTaskRunError";
    }
  },
  metadata: { root: { increment: vi.fn() }, set: vi.fn() },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

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
      // Seed a podcast (required FK for episodes)
      const [podcast] = await db
        .insert(podcasts)
        .values({
          podcastIndexId: asPodcastIndexEpisodeId(`${LABEL_PREFIX}podcast_001`),
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

      // Seed 5 episodes with summaries and varying coverage scores
      const episodeValues = Array.from({ length: 5 }, (_, i) => ({
        podcastId: fixturePodcastId,
        podcastIndexId: asPodcastIndexEpisodeId(`${LABEL_PREFIX}ep_${i + 1}`),
        title: `${LABEL_PREFIX}Episode ${i + 1}`,
        summary: `Integration test summary for episode ${i + 1}. Creatine is discussed here with detail ${i}.`,
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

    it("UPSERT on re-run: updates existing row without creating duplicates", async () => {
      // Run again — should update the existing row, not insert a new one
      mockGenerateCompletion.mockResolvedValueOnce(
        JSON.stringify({
          consensus_points: ["Updated A", "Updated B", "Updated C"],
          disagreement_points: [],
          digest_markdown: "Updated digest markdown for re-run test.",
        }),
      );

      // Wait 1ms so generatedAt changes
      await new Promise((resolve) => setTimeout(resolve, 1));
      const result = await taskConfig.run({
        canonicalTopicId: fixtureCanonicalId,
      });

      // Rate guard window is 1h — this second call will be rate-guarded in task layer
      // The task was just run above, so generatedAt is < 1h ago
      expect(result.status).toBe("rate_guarded");

      // Confirm still exactly one row
      const rows = await db.execute<{ count: number }>(
        sql`SELECT COUNT(*)::int AS count FROM canonical_topic_digests WHERE canonical_topic_id = ${fixtureCanonicalId}`,
      );
      expect(rows.rows[0].count).toBe(1);
    });
  },
);
