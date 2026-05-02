/**
 * Module-level numeric tunables for the nightly canonical-topic
 * reconciliation Trigger.dev task (`src/trigger/reconcile-canonicals.ts`,
 * issue #389).
 *
 * Kept out of `@/db/schema` so that the wide-mocked-module hazard from
 * MEMORY.md does not propagate (production code consumes these values at
 * module-eval time; an unrelated test that `vi.mock("@/db/schema", ...)`
 * with a narrow factory would otherwise crash).
 *
 * See ADR-050 for the rationale behind each value.
 */

import type { CanonicalTopicKind } from "@/db/schema";

/**
 * Cosine-distance ceiling for two canonicals to be considered DBSCAN
 * neighbors. Cosine similarity ≥ 0.90 — slightly looser than the resolver's
 * 0.92 auto-match threshold so reconciliation has a candidate-generation
 * window the resolver's conservative ingestion path missed. ADR-050 §1.
 */
export const RECONCILE_DBSCAN_EPS = 0.1;

/**
 * Minimum DBSCAN cluster size. Matches the issue spec — singleton "clusters"
 * are dropped before any LLM call. ADR-050 §1.
 */
export const RECONCILE_DBSCAN_MIN_POINTS = 2;

/**
 * Decay window: an event-type canonical with `last_seen` older than this is
 * flipped from `active` to `dormant` in Phase 7 (subject to the kind
 * whitelist + `ongoing=false` predicate). ADR-042 §"Decay" + ADR-050 §5.
 */
export const RECONCILE_DECAY_DAYS = 180;

/**
 * Phase 1 active-canonical window — only canonicals seen in the last 30 days
 * enter the clustering pass. The window also bounds DBSCAN's input to a
 * homogeneous-density neighborhood so a flat-density assumption is safe.
 */
export const RECONCILE_LOOKBACK_DAYS = 30;

/**
 * Internal time-budget guard. The Trigger.dev `maxDuration` ceiling is 600s;
 * 540_000 ms (90%) leaves ~60s headroom for Phase 6 drift queries, Phase 7
 * decay UPDATE, and Phase 8 summary log so `reconcile_summary` always emits
 * even on a budget-exhausted run. ADR-050 §6.
 */
export const RECONCILE_BUDGET_MS = 540_000;

/**
 * Canonical-topic kinds eligible for the Phase 7 decay flip.
 *
 * Topic-type kinds (`concept`, `work`) are excluded by construction —
 * they describe ongoing concepts and never time out. `merged` is excluded
 * by the status filter, not by this list. The decay whitelist deliberately
 * narrows ADR-042's broader event-type set to the six concrete kinds the
 * issue spec lists; `other` is omitted (deviation documented in ADR-050 §5).
 */
export const RECONCILE_DECAY_KINDS: readonly CanonicalTopicKind[] = [
  "release",
  "incident",
  "regulation",
  "announcement",
  "deal",
  "event",
] as const;
