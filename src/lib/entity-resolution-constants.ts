/**
 * Tunables for the canonical-topic entity-resolution pipeline.
 *
 * Standalone module with no runtime dependencies. Imported by
 * `entity-resolution.ts`, the disambiguator prompt builder, and tests.
 *
 * Kept out of `@/db/schema` deliberately: widely-mocked schema modules crash
 * unrelated tests when consumers read new runtime exports at module-eval
 * time. Module-level constants live here instead.
 */

/** Top-1 cosine similarity STRICTLY ABOVE this short-circuits to auto-match. */
export const AUTO_MATCH_SIMILARITY_THRESHOLD = 0.92;

/** Any candidate at or above this similarity routes to the LLM disambiguator. */
export const DISAMBIGUATE_SIMILARITY_THRESHOLD = 0.82;

/** Synthetic similarity assigned when an exact-label match short-circuits the kNN. */
export const EXACT_MATCH_SIMILARITY = 1.0;

/** Top-K candidates passed to the disambiguator and considered for `candidatesConsidered`. */
export const KNN_DISAMBIG_CANDIDATE_POOL = 20;

/** HNSW recall budget — keeps the post-filter survivor set ≥20 (ADR-043). */
export const HNSW_EF_SEARCH = 200;

/** Token budget for the disambiguator response (a single `chosen_id` JSON object). */
export const DISAMBIG_MAX_TOKENS = 256;

/** Temperature for the disambiguator call — deterministic. */
export const DISAMBIG_TEMPERATURE = 0;

/** Window during which event-type canonicals remain visible to kNN (ADR-042). */
export const RECENT_EVENT_WINDOW_DAYS = 90;

/**
 * Minimum relevance for a `kind: "other"` topic to canonicalize. Below this
 * floor, the resolver throws `EntityResolutionError("other_below_relevance_floor")`
 * and the caller skips the topic. Source: ADR-042 §"Trade-offs accepted".
 */
export const OTHER_KIND_RELEVANCE_FLOOR = 0.5;

/**
 * The three values written to `episode_canonical_topics.match_method` and
 * exposed on `ResolveTopicResult.matchMethod`. Mirrors the CHECK constraint
 * `ect_match_method_enum` in `src/db/schema.ts`.
 */
export const MATCH_METHODS = ["auto", "llm_disambig", "new"] as const;
export type MatchMethod = (typeof MATCH_METHODS)[number];

/**
 * Matches version-like tokens within a label: `1.2`, `1.2.3`, `2025`, `v1`, `v2.0`, etc.
 * Used by `hasVersionTokenMismatch` to force disambiguation when tokens differ.
 * Exact pattern from ADR-042 §"Version-token regex pre-gate".
 */
export const VERSION_TOKEN_REGEX =
  /\b(\d+\.\d+(?:\.\d+)?|\d{4}|v\d+(?:\.\d+)*)\b/g;

/**
 * Per-episode hard cap on disambiguator LLM calls. Topics beyond this limit
 * short-circuit to `forceInsertNewCanonical` (ADR-042 §"Three-tier resolution
 * pipeline"; ADR-045 §1 — orchestrator owns the cap).
 */
export const MAX_DISAMBIG_CALLS_PER_EPISODE = 5;
