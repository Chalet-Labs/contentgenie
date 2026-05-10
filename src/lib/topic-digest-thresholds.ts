/** Minimum derived episode count for digest generation (ADR-051). */
export const MIN_DERIVED_COUNT_FOR_DIGEST = 3;

/** Minimum episode-count growth since last generation to treat digest as stale (ADR-051). */
export const STALENESS_GROWTH_THRESHOLD = 3;

/** Maximum number of related topics returned by the kNN query on the topic detail page. */
export const RELATED_TOPICS_LIMIT = 5;

/**
 * Single source of truth for the "is this canonical's digest synthesizable
 * right now?" predicate (ADR-051). Used by the server-side trigger gate
 * (`triggerTopicDigestGeneration`) AND by the client-side chip CTA enrichment
 * so chip visibility cannot drift from action behavior.
 *
 * Both inputs use **completed-summary count** (not raw junction count) — this
 * matches the digest task's `summary_status = 'completed'` predicate. Using
 * the raw count would let the chip show Synthesize for canonicals the action
 * then rejects as `ineligible`, producing a silent dead-end UX.
 *
 * Staleness is symmetric (`Math.abs(...)`) so a canonical that SHRINKS by
 * ≥ STALENESS_GROWTH_THRESHOLD (e.g. after a reconciliation merge) is also
 * treated as stale and re-synthesizable, matching the action's gate.
 */
export function isDigestSynthesizable(meta: {
  completedSummaryCount: number;
  digestEpisodeCountAtGeneration: number | null;
}): boolean {
  if (meta.completedSummaryCount < MIN_DERIVED_COUNT_FOR_DIGEST) return false;
  if (meta.digestEpisodeCountAtGeneration === null) return true;
  return (
    Math.abs(
      meta.completedSummaryCount - meta.digestEpisodeCountAtGeneration,
    ) >= STALENESS_GROWTH_THRESHOLD
  );
}
