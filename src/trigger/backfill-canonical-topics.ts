/**
 * Backfill canonical topics from stored episode summaries.
 *
 * Re-extracts the canonical-topic layer ONLY from the already-stored summary
 * text (no transcript, no re-summarization). This is ~100× cheaper than
 * full re-summarization at the cost of slightly thinner extraction quality
 * (spec R5 trade-off; see ADR-048).
 *
 * Per-episode idempotence is layered:
 *   1. LEFT JOIN IS NULL selection guard (main path)
 *   2. Resolver's ON CONFLICT DO NOTHING via junction unique index
 *   3. isNotNull(summary) + length >= 100 SQL floor
 *
 * See docs/adr/048-backfill-canonical-topics-cheap-reextract.md
 */

import { task, logger, metadata } from "@trigger.dev/sdk";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { episodeCanonicalTopics, episodes } from "@/db/schema";
import { generateCompletion } from "@/lib/ai";
import { getCategoryBanlist } from "@/lib/category-banlist";
import { parseJsonResponse } from "@/lib/openrouter";
import {
  getTopicReextractPrompt,
  TOPIC_REEXTRACT_SYSTEM_PROMPT,
} from "@/lib/prompts/topic-reextract";
import { normalizeTopics } from "@/trigger/helpers/ai-summary";
import { resolveAndPersistEpisodeTopics } from "@/trigger/helpers/resolve-topics";

// Configurable constants — see ADR-048 §1 for rationale on each value.
const BACKFILL_INTER_EPISODE_DELAY_MS = 500;
const BACKFILL_DEFAULT_BATCH_SIZE = 50;
// Minimum summary length to be considered for extraction.
// Boilerplate/stub summaries reliably hallucinate topics; 100 chars (~150 tokens)
// is the structural floor. See spec R5 + ADR-048 §3.
const BACKFILL_MIN_SUMMARY_LENGTH = 100;

export type BackfillPayload = {
  /** How many episodes to process in this run. Default: 50. */
  batchSize?: number;
  /**
   * Process specific episodes by ID. When provided the LEFT-JOIN guard is
   * dropped; the caller is asserting "process these specifically." The
   * resolver's ON CONFLICT DO NOTHING still prevents exact duplicate rows.
   * See ADR-048 §3 for the additive-idempotence note on this path.
   */
  episodeIds?: number[];
  /**
   * Run the LLM + normalizer but skip persistence. Useful for pre-flight
   * validation against distribution drift (ADR-048 §4). Logged output lets
   * ops sanity-check 20 episodes before committing to a full corpus run.
   * Default: false.
   *
   * @warning Setting batchSize >> 50 risks metadata payload truncation
   *   (~256 KB cap). The default 50-episode batch is well under this limit.
   */
  dryRun?: boolean;
};

export type BackfillResult = {
  processed: number;
  resolved: number;
  failed: number;
  skippedShortSummary: number;
  dryRun: boolean;
};

export const backfillCanonicalTopics = task({
  id: "backfill-canonical-topics",
  queue: {
    name: "backfill-canonical-topics-queue",
    // Lower than summarize-queue (3) to avoid crowding out fresh ingestion
    // and to stay within OpenRouter's per-second rate limit (ADR-048 §1).
    concurrencyLimit: 2,
  },
  machine: "small-1x",
  maxDuration: 60 * 30, // 30 min — generous ceiling for large batches
  retry: { maxAttempts: 1 }, // task is re-runnable; no auto-retry storms

  async run(payload: BackfillPayload): Promise<BackfillResult> {
    const dryRun = payload.dryRun ?? false;
    const batchSize = payload.batchSize ?? BACKFILL_DEFAULT_BATCH_SIZE;

    // Fetch banlist once at task start. The module-scope cache (1h TTL) means
    // warm-cache cost is ~free on subsequent episodes in the same run.
    const banlist = await getCategoryBanlist();

    // ── Fetch candidate episodes ──────────────────────────────────────────────

    let rows: Array<{ id: number; summary: string | null }>;

    if (payload.episodeIds && payload.episodeIds.length > 0) {
      // Targeted re-run: caller specifies which episodes to process.
      // LEFT-JOIN guard omitted (see ADR-048 §3); null/length floor still applies.
      rows = await db
        .select({ id: episodes.id, summary: episodes.summary })
        .from(episodes)
        .where(
          and(
            inArray(episodes.id, payload.episodeIds),
            isNotNull(episodes.summary),
            sql`length(${episodes.summary}) >= ${BACKFILL_MIN_SUMMARY_LENGTH}`,
          ),
        );
    } else {
      // Main path: only episodes that have no junction rows yet.
      rows = await db
        .select({ id: episodes.id, summary: episodes.summary })
        .from(episodes)
        .leftJoin(
          episodeCanonicalTopics,
          eq(episodeCanonicalTopics.episodeId, episodes.id),
        )
        .where(
          and(
            isNull(episodeCanonicalTopics.episodeId),
            isNotNull(episodes.summary),
            sql`length(${episodes.summary}) >= ${BACKFILL_MIN_SUMMARY_LENGTH}`,
          ),
        )
        .orderBy(desc(episodes.createdAt))
        .limit(batchSize);
    }

    const total = rows.length;
    let processed = 0;
    let resolved = 0;
    let failed = 0;

    metadata.set("progress", {
      total,
      processed: 0,
      resolved: 0,
      failed: 0,
      skippedShortSummary: 0,
      dryRun,
    });

    // ── Per-episode loop ──────────────────────────────────────────────────────

    for (const row of rows) {
      const episodeId = row.id;
      // summary is guaranteed non-null and length >= 100 by the WHERE clause
      const summary = row.summary as string;

      try {
        const prompt = getTopicReextractPrompt(summary, banlist);
        const completion = await generateCompletion([
          { role: "system", content: TOPIC_REEXTRACT_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ]);

        const parsed = parseJsonResponse<{ topics: unknown }>(completion);
        const topics = normalizeTopics(parsed.topics, banlist);

        if (dryRun) {
          logger.info("[backfill] dry-run extracted", {
            episodeId,
            topicCount: topics.length,
            topics,
          });
        } else {
          // Pass episode.summary per the existing call signature in
          // summarize-episode.ts. The resolver binds it as `_summary` and
          // does not use it today — context embeddings are derived from each
          // topic's own NormalizedTopic.summary field. Passing it keeps the
          // call site forward-compatible (ADR-048 §5).
          const result = await resolveAndPersistEpisodeTopics(
            episodeId,
            topics,
            summary,
            { skipResolution: false },
          );
          resolved += result.resolved;
          failed += result.failed;
        }
      } catch (err) {
        logger.warn("[backfill] per-episode failure", {
          episodeId,
          error:
            err instanceof Error
              ? err.message.slice(0, 200)
              : String(err).slice(0, 200),
        });
        failed++;
      }

      processed++;
      metadata.increment("processed", 1);

      // Smooth out OpenRouter request bursts between episodes (ADR-048 §1).
      await new Promise((r) => setTimeout(r, BACKFILL_INTER_EPISODE_DELAY_MS));
    }

    const result: BackfillResult = {
      processed,
      resolved,
      failed,
      skippedShortSummary: 0, // SQL floor handles this pre-fetch; count is always 0 here
      dryRun,
    };

    logger.info("[backfill] complete", result);
    return result;
  },
});
