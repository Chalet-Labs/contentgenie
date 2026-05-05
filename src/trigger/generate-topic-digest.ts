import { task, logger, metadata, AbortTaskRunError } from "@trigger.dev/sdk";
import { and, desc, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import {
  canonicalTopicDigests,
  canonicalTopics,
  episodeCanonicalTopics,
  episodes,
} from "@/db/schema";
import { generateCompletion } from "@/lib/ai";
import { getActiveAiConfig } from "@/lib/ai/config";
import { parseJsonResponse } from "@/lib/openrouter";
import {
  getTopicDigestPrompt,
  topicDigestSchema,
  TOPIC_DIGEST_SYSTEM_PROMPT,
  type TopicDigestPayload,
} from "@/lib/prompts/topic-digest";
import {
  canonicalTopicEpisodeCount,
  canonicalTopicCompletedSummaryCount,
} from "@/lib/admin/canonical-topic-episode-count";
import { MIN_DERIVED_COUNT_FOR_DIGEST } from "@/lib/topic-digest-thresholds";

const RATE_GUARD_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_EPISODE_INPUT = 30;
const DIGEST_MAX_TOKENS = 4096;
const DIGEST_TEMPERATURE = 0.4;

export type GenerateTopicDigestPayload = {
  canonicalTopicId: number;
};

export type GenerateTopicDigestResult = {
  status: "generated" | "rate_guarded";
  digestId?: number;
  modelUsed?: string;
  episodeCount?: number;
  durationMs?: number;
};

export const generateTopicDigest = task({
  id: "generate-topic-digest",
  queue: { name: "topic-digest-queue", concurrencyLimit: 3 },
  maxDuration: 120,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
  },

  run: async (
    payload: GenerateTopicDigestPayload,
  ): Promise<GenerateTopicDigestResult> => {
    const { canonicalTopicId } = payload;
    const startMs = Date.now();

    // ── Step 1: Validate canonical topic ────────────────────────────────────
    const canonicalRows = await db
      .select({
        id: canonicalTopics.id,
        label: canonicalTopics.label,
        summary: canonicalTopics.summary,
        status: canonicalTopics.status,
        episodeCount: canonicalTopicEpisodeCount(),
        completedSummaryCount: canonicalTopicCompletedSummaryCount(),
      })
      .from(canonicalTopics)
      .where(eq(canonicalTopics.id, canonicalTopicId));

    const canonical = canonicalRows[0];

    if (
      !canonical ||
      canonical.status !== "active" ||
      canonical.completedSummaryCount < MIN_DERIVED_COUNT_FOR_DIGEST
    ) {
      metadata.root.increment("digests.aborted", 1);
      throw new AbortTaskRunError(
        canonical?.status !== "active"
          ? "CANONICAL_NOT_ACTIVE"
          : "INSUFFICIENT_COMPLETED_SUMMARIES",
      );
    }

    const derivedCount = canonical.episodeCount;

    logger.info("[generate-topic-digest] validated canonical", {
      canonicalTopicId,
      status: canonical.status,
      derivedCount,
    });

    // ── Step 2: Rate guard ──────────────────────────────────────────────────
    const digestRows = await db
      .select({
        id: canonicalTopicDigests.id,
        generatedAt: canonicalTopicDigests.generatedAt,
        episodeCountAtGeneration:
          canonicalTopicDigests.episodeCountAtGeneration,
        modelUsed: canonicalTopicDigests.modelUsed,
      })
      .from(canonicalTopicDigests)
      .where(eq(canonicalTopicDigests.canonicalTopicId, canonicalTopicId));

    const existingDigest = digestRows[0] ?? null;

    if (
      existingDigest &&
      Date.now() - existingDigest.generatedAt.getTime() < RATE_GUARD_WINDOW_MS
    ) {
      metadata.root.increment("digests.rate_guarded", 1);
      logger.info("[generate-topic-digest] rate-guarded", {
        canonicalTopicId,
        digestId: existingDigest.id,
      });
      return {
        status: "rate_guarded",
        digestId: existingDigest.id,
        modelUsed: existingDigest.modelUsed,
        episodeCount: existingDigest.episodeCountAtGeneration,
      };
    }

    // ── Step 3: Read episode summaries ──────────────────────────────────────
    const episodeRows = await db
      .select({
        id: episodes.id,
        title: episodes.title,
        summary: episodes.summary,
        coverageScore: episodeCanonicalTopics.coverageScore,
        createdAt: episodeCanonicalTopics.createdAt,
      })
      .from(episodeCanonicalTopics)
      .innerJoin(episodes, eq(episodeCanonicalTopics.episodeId, episodes.id))
      .where(
        and(
          eq(episodeCanonicalTopics.canonicalTopicId, canonicalTopicId),
          isNotNull(episodes.summary),
          eq(episodes.summaryStatus, "completed"),
        ),
      )
      .orderBy(
        desc(episodeCanonicalTopics.coverageScore),
        desc(episodeCanonicalTopics.createdAt),
      )
      .limit(MAX_EPISODE_INPUT);

    const validEpisodeRows = episodeRows.filter(
      (ep): ep is typeof ep & { summary: string } =>
        typeof ep.summary === "string" && ep.summary.trim().length > 0,
    );

    if (validEpisodeRows.length < MIN_DERIVED_COUNT_FOR_DIGEST) {
      metadata.root.increment("digests.insufficient_summaries", 1);
      throw new AbortTaskRunError("INSUFFICIENT_VALID_SUMMARIES");
    }

    const episodeIds = validEpisodeRows.map((ep) => ep.id);
    const episodeSummaries = validEpisodeRows.map((ep) => ({
      id: ep.id,
      title: ep.title,
      summary: ep.summary,
    }));

    // ── Step 4–5: LLM call + parse + validate ───────────────────────────────
    const aiConfig = await getActiveAiConfig();
    const modelUsed = aiConfig.model;

    let parsed: TopicDigestPayload;
    try {
      const completion = await generateCompletion(
        [
          { role: "system", content: TOPIC_DIGEST_SYSTEM_PROMPT },
          {
            role: "user",
            content: getTopicDigestPrompt(
              canonical.label,
              canonical.summary,
              episodeSummaries,
            ),
          },
        ],
        { maxTokens: DIGEST_MAX_TOKENS, temperature: DIGEST_TEMPERATURE },
      );

      const raw: unknown = parseJsonResponse<unknown>(completion);
      parsed = topicDigestSchema.parse(raw);
    } catch (err) {
      metadata.root.increment("digests.llm_failed", 1);
      throw err;
    }

    // ── Step 6: UPSERT ──────────────────────────────────────────────────────
    // `episodeCountAtGeneration` records the uncapped count of digestable
    // episodes (the same value `canonicalTopicCompletedSummaryCount` returns to
    // the action's staleness gate) so the two saturate identically. Storing
    // `episodeRows.length` here would cap at MAX_EPISODE_INPUT and leave any
    // topic with more completed summaries permanently above the threshold —
    // perpetually re-queued after each cooldown even when the input set is
    // unchanged.
    const includedEpisodeCount = canonical.completedSummaryCount;
    const now = new Date();
    const [upserted] = await db
      .insert(canonicalTopicDigests)
      .values({
        canonicalTopicId,
        digestMarkdown: parsed.digest_markdown,
        consensusPoints: parsed.consensus_points,
        disagreementPoints: parsed.disagreement_points,
        episodeIds,
        episodeCountAtGeneration: includedEpisodeCount,
        modelUsed,
        generatedAt: now,
      })
      .onConflictDoUpdate({
        target: canonicalTopicDigests.canonicalTopicId,
        set: {
          digestMarkdown: parsed.digest_markdown,
          consensusPoints: parsed.consensus_points,
          disagreementPoints: parsed.disagreement_points,
          episodeIds,
          episodeCountAtGeneration: includedEpisodeCount,
          modelUsed,
          generatedAt: now,
        },
      })
      .returning({ id: canonicalTopicDigests.id });

    // ── Step 7: Metrics ─────────────────────────────────────────────────────
    metadata.root.increment("digests.generated", 1);
    metadata.set("progress", {
      canonicalId: canonicalTopicId,
      episodeCount: includedEpisodeCount,
      modelUsed,
    });

    logger.info("[generate-topic-digest] digest generated", {
      canonicalTopicId,
      digestId: upserted.id,
      episodeCount: includedEpisodeCount,
      modelUsed,
    });

    return {
      status: "generated",
      digestId: upserted.id,
      modelUsed,
      episodeCount: includedEpisodeCount,
      durationMs: Date.now() - startMs,
    };
  },
});
