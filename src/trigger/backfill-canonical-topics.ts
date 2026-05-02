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
 * Known limitation: an episode that legitimately resolves to zero topics
 * writes no junction rows, so the LEFT-JOIN guard re-selects it on every
 * future main-path run (Codex P2). With ORDER BY createdAt DESC + a fixed
 * batch limit, recently-zero-topic episodes can starve older candidates.
 * Mitigation today: use the `episodeIds` payload for targeted re-runs and
 * keep the main path as a one-time bulk pass. A `canonical_topics_processed_at`
 * marker column would resolve this structurally — out of scope for #390.
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
// Exported so tests can assert against the symbols rather than hardcoded
// duplicates (per code-review-checklist §3).
export const BACKFILL_INTER_EPISODE_DELAY_MS = 500;
export const BACKFILL_DEFAULT_BATCH_SIZE = 50;
// Minimum summary length to be considered for extraction. Boilerplate/stub
// summaries reliably hallucinate topics; 100 chars (~150 tokens) is the
// structural floor. See spec R5 + ADR-048 §3.
export const BACKFILL_MIN_SUMMARY_LENGTH = 100;
// Output ceiling for the re-extract LLM call. Bounded per ADR-048 §2 so a
// runaway response cannot blow the cost budget on a 50-episode batch.
export const BACKFILL_MAX_OUTPUT_TOKENS = 250;
// Deterministic-ish sampling for extraction. 0 risks repetition; small
// non-zero is the practical default per existing call sites in the repo.
export const BACKFILL_TEMPERATURE = 0.1;
// Truncation cap on logged error messages. Keeps per-episode log payloads
// bounded without dropping the structured `Error` cause if the logger
// serialises it natively.
const ERROR_MESSAGE_MAX_CHARS = 200;

export type BackfillPayload = {
  /**
   * How many episodes to process in this run. Default: 50.
   *
   * Larger batches lengthen wall-clock time (~3-5s LLM + 500ms delay per
   * episode) and can approach the task's 30-min `maxDuration`. Use the
   * default unless you have a specific reason to deviate.
   */
  batchSize?: number;
  /**
   * Process specific episodes by ID. When provided the LEFT-JOIN guard is
   * dropped; the caller is asserting "process these specifically." The
   * resolver's ON CONFLICT DO NOTHING still prevents exact duplicate rows
   * for the same `(episodeId, canonicalTopicId)` pair.
   *
   * Targeted re-runs are *additively* idempotent — the unique index
   * prevents exact duplicates, but a different LLM extraction (distribution
   * drift) can produce a NEW (episode, canonical) pair on the same episode.
   * Main path (no `episodeIds`) is episode-level idempotent via the
   * LEFT-JOIN guard. See ADR-048 §3.
   *
   * An explicit empty array (`episodeIds: []`) is treated as "process
   * nothing" and returns immediately — it does NOT fall through to the
   * main path, since an empty selection from a caller is far more likely
   * to be intentional ("no IDs in scope") than accidental.
   */
  episodeIds?: number[];
  /**
   * Run the LLM + normalizer but skip persistence. Useful for pre-flight
   * validation against distribution drift (ADR-048 §4). Per-episode dry-run
   * results are logged at info level so ops can sanity-check a 20-episode
   * sample before committing to a full corpus run. Default: false.
   */
  dryRun?: boolean;
};

export type BackfillResult = {
  processed: number;
  resolved: number;
  failed: number;
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

    // Empty episodeIds is treated as an explicit no-op — a caller passing
    // `{ episodeIds: [] }` (e.g. from a UI multi-select that resolved to
    // zero rows) almost certainly wants "process nothing", not "fall back
    // to the next 50 candidates from the main path".
    if (payload.episodeIds !== undefined && payload.episodeIds.length === 0) {
      logger.info("[backfill] no episodeIds supplied; nothing to do");
      return { processed: 0, resolved: 0, failed: 0 };
    }

    // Fetch banlist once at task start. The module-scope cache (1h TTL) means
    // warm-cache cost is ~free on subsequent episodes in the same run.
    const banlist = await getCategoryBanlist();

    // ── Fetch candidate episodes ──────────────────────────────────────────────

    let rows: Array<{ id: number; summary: string | null }>;

    if (payload.episodeIds !== undefined) {
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
      // Required: ORDER BY for cross-run batch determinism on Neon Postgres
      // (ADR-048 §3) — without it, .limit() can repeat-overlap or skip
      // episodes silently between runs.
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
    let resolved = 0; // Successful episodes
    let failed = 0; // Failed episodes

    // Re-emit the full progress object after every episode so the
    // Trigger.dev dashboard reflects mid-run state (matches the pattern in
    // batch-summarize-episodes.ts). `metadata.increment` only updates a
    // single top-level key, so it cannot keep `progress.processed` in sync
    // with the local counter.
    const setProgress = () => {
      metadata.set("progress", { total, processed, resolved, failed, dryRun });
    };
    setProgress();

    // ── Per-episode loop ──────────────────────────────────────────────────────

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const episodeId = row.id;
      // summary is guaranteed non-null by the WHERE clause; log a warning if
      // the invariant fires so query regressions surface rather than silently skip.
      if (row.summary == null) {
        logger.warn(
          "[backfill] invariant violation: null summary after SQL guard",
          {
            episodeId,
          },
        );
        continue;
      }
      const summary = row.summary;

      try {
        const prompt = getTopicReextractPrompt(summary, banlist);
        const completion = await generateCompletion(
          [
            { role: "system", content: TOPIC_REEXTRACT_SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          {
            maxTokens: BACKFILL_MAX_OUTPUT_TOKENS,
            temperature: BACKFILL_TEMPERATURE,
          },
        );

        const parsed = parseJsonResponse<{ topics: unknown }>(completion);
        // Defensive runtime guard: the LLM can return a top-level array,
        // null, or a misshaped object. `normalizeTopics` accepts `unknown`
        // but a non-array `topics` field could surprise callers in the
        // future; coerce to [] so behaviour is well-defined.
        const rawTopics = Array.isArray(parsed?.topics) ? parsed.topics : [];
        const topics = normalizeTopics(rawTopics, banlist);

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
          resolved++; // one episode succeeded; topic-level metrics logged by resolver
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message.slice(0, ERROR_MESSAGE_MAX_CHARS)
            : String(err).slice(0, ERROR_MESSAGE_MAX_CHARS);
        logger.warn("[backfill] per-episode failure", {
          episodeId,
          error: errorMessage,
        });
        failed++;
      }

      processed++;
      setProgress();

      // Smooth out OpenRouter request bursts between episodes (ADR-048 §1).
      // Skip after the final episode — the trailing delay is wasted wall-clock.
      if (idx < rows.length - 1) {
        await new Promise((r) =>
          setTimeout(r, BACKFILL_INTER_EPISODE_DELAY_MS),
        );
      }
    }

    const result: BackfillResult = { processed, resolved, failed };

    // Severity matches outcome so level-keyed alerting works:
    //   - all episodes failed → error (page someone)
    //   - some episodes failed → warn
    //   - clean run → info
    if (total > 0 && failed === total) {
      logger.error("[backfill] complete — all episodes failed", result);
    } else if (failed > 0) {
      logger.warn("[backfill] complete with failures", result);
    } else {
      logger.info("[backfill] complete", result);
    }
    return result;
  },
});
