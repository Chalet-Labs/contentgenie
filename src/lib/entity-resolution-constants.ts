/**
 * Tunables for the canonical-topic entity-resolution pipeline.
 *
 * Standalone module with no runtime dependencies. Imported by
 * `entity-resolution.ts`, the disambiguator prompt builder, and tests.
 *
 * Kept out of `@/db/schema` deliberately — widely-mocked schema modules
 * crash unrelated tests when consumers read new runtime exports at
 * module-eval time. See ADR-044 and ADR-042.
 */

/** Top-1 cosine similarity STRICTLY ABOVE this short-circuits to auto-match. */
export const AUTO_MATCH_SIMILARITY_THRESHOLD = 0.92;

/** Any candidate at or above this similarity routes to the LLM disambiguator. */
export const DISAMBIGUATE_SIMILARITY_THRESHOLD = 0.82;

/** Number of top-1 hits we consider for the auto-match decision (kept for symmetry). */
export const KNN_AUTO_MATCH_LIMIT = 1;

/** Top-K candidates passed to the disambiguator and considered for `candidatesConsidered`. */
export const KNN_DISAMBIG_CANDIDATE_POOL = 20;

/** HNSW recall budget — keeps the post-filter survivor set ≥20 (ADR-043). */
export const HNSW_EF_SEARCH = 200;

/** Per-episode cap on disambiguator calls (enforced upstream by A5, not the resolver). */
export const MAX_DISAMBIG_CALLS_PER_EPISODE = 5;

/** Per-episode cap on `concept`-kind canonicals (enforced upstream by A5). */
export const MAX_CONCEPTS_PER_EPISODE = 3;

/** Sample size for the category banlist when building the disambig prompt. */
export const CATEGORY_BANLIST_SAMPLE_SIZE = 50;

/** Window during which event-type canonicals remain visible to kNN (ADR-042). */
export const RECENT_EVENT_WINDOW_DAYS = 90;

/** Threshold past which an event-type canonical is considered dormant (ADR-042). */
export const DORMANCY_THRESHOLD_DAYS = 180;

/**
 * Matches version-like tokens within a label: `1.2`, `1.2.3`, `2025`, `v1`, `v2.0`, etc.
 * Used by `hasVersionTokenMismatch` to force disambiguation when tokens differ.
 * Exact pattern from ADR-042 §"Version-token regex pre-gate".
 */
export const VERSION_TOKEN_REGEX =
  /\b(\d+\.\d+(?:\.\d+)?|\d{4}|v\d+(?:\.\d+)*)\b/g;
