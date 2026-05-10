import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { canonicalTopics, canonicalTopicDigests } from "@/db/schema";
import { canonicalTopicCompletedSummaryCount } from "@/lib/admin/canonical-topic-episode-count";

/**
 * Per-canonical chip metadata used to drive the "Synthesize digest" CTA
 * gate on `<TopicChip>`. Both fields use COMPLETED-SUMMARY count (not raw
 * junction count) so the chip's gate matches the server-side
 * `triggerTopicDigestGeneration` eligibility predicate exactly. See
 * `isDigestSynthesizable` in `@/lib/topic-digest-thresholds`.
 */
export type ChipMetadata = {
  completedSummaryCount: number;
  digestEpisodeCountAtGeneration: number | null;
};

/**
 * Two parallel single-table queries to fetch chip metadata.
 *
 * Why two queries instead of one `from(canonicalTopics).leftJoin(canonicalTopicDigests, ...)`:
 * the `canonicalTopicCompletedSummaryCount()` helper emits a correlated
 * subquery referencing `${canonicalTopics}.${canonicalTopics.id}`. In any
 * multi-table Drizzle query, the inner `${canonicalTopics.id}` interpolation
 * qualifies to `"canonical_topics"."id"` and concatenated with the leading
 * `${canonicalTopics}.` produces the broken
 * `"canonical_topics"."canonical_topics"."id"` reference, which Postgres
 * rejects with 42P01 ("invalid reference to FROM-clause entry"). Splitting
 * into two single-table queries (each with a bare `from(canonicalTopics)`
 * or `from(canonicalTopicDigests)`) sidesteps the bug. Confirmed by
 * `topics-recent-digests.integration.test.ts`.
 *
 * Bounded fan-out: callers pass at most one id per chip per surface (e.g.
 * `library_size × CANONICAL_TOPICS_PER_EPISODE` for the library page).
 *
 * Callers should wrap this in try/catch — chips render without the CTA on
 * failure (degraded UX, not a broken page).
 */
export async function fetchChipMetadata(
  canonicalIds: number[],
): Promise<Map<number, ChipMetadata>> {
  if (canonicalIds.length === 0) return new Map();
  const [countRows, digestRows] = await Promise.all([
    db
      .select({
        id: canonicalTopics.id,
        completedSummaryCount: canonicalTopicCompletedSummaryCount(),
      })
      .from(canonicalTopics)
      .where(inArray(canonicalTopics.id, canonicalIds)),
    db
      .select({
        canonicalTopicId: canonicalTopicDigests.canonicalTopicId,
        episodeCountAtGeneration:
          canonicalTopicDigests.episodeCountAtGeneration,
      })
      .from(canonicalTopicDigests)
      .where(inArray(canonicalTopicDigests.canonicalTopicId, canonicalIds)),
  ]);
  const digestById = new Map(
    digestRows.map((r) => [r.canonicalTopicId, r.episodeCountAtGeneration]),
  );
  return new Map(
    countRows.map((r) => [
      r.id,
      {
        completedSummaryCount: Number(r.completedSummaryCount ?? 0),
        digestEpisodeCountAtGeneration: digestById.get(r.id) ?? null,
      },
    ]),
  );
}
