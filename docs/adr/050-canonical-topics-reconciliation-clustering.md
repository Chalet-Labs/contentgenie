# ADR-050: Canonical-Topic Reconciliation — Clustering, Pairwise Verification, Per-Merge Transactions

**Status:** Proposed
**Date:** 2026-05-02
**Issue:** [#389](https://github.com/Chalet-Labs/contentgenie/issues/389) (part of epic [#376](https://github.com/Chalet-Labs/contentgenie/issues/376))
**Spec:** `.dev/pm/specs/2026-04-25-canonical-topics-foundation.md` (Approved; internal — not committed to the repo)
**Relates to:** [ADR-022](022-trending-topics-snapshot.md), [ADR-033](033-cross-episode-topic-ranking.md), [ADR-042](042-canonical-topics-foundation.md), [ADR-044](044-entity-resolution-transactional-pattern.md), [ADR-046](046-admin-canonical-merge.md)

---

## Context

[ADR-042](042-canonical-topics-foundation.md) ratified the canonical-topic data model and the three-tier ingestion-time resolution pipeline (auto-match → LLM disambiguator → new-insert). The resolver is conservative by construction: under burst ingestion of a launch-day news event, the kNN candidate filter (`last_seen > now() - 90 days`, ADR-042 §"Trade-offs accepted" line 156) plus the per-episode disambiguator cap (5 calls) plus the new-insert fall-through means duplicates _will_ be created — and the spec accepts that, on the explicit understanding that a nightly reconciliation pass cleans them up.

This ADR fills in the reconciliation pass. It must:

1. Generate merge candidates without an authoritative join key — embeddings are the only signal that crosses surface forms.
2. Decide which canonical "wins" each merge in a way that avoids the over-merge mode group-judges fall into.
3. Reuse [ADR-046](046-admin-canonical-merge.md)'s `mergeCanonicals` helper (the deterministic-atomic merge primitive) without holding a single task-wide transaction across many LLM calls.
4. Decay event-type kinds whose `last_seen` is older than 180 days.
5. Survive partial failure — one failed cluster, one failed LLM call, one failed merge must not abort the run.
6. Stay idempotent: a second run after a clean first run must merge nothing.

Three structural problems force decisions that warrant an ADR rather than ad-hoc code:

1. **No mature MIT-licensed HDBSCAN in npm.** The issue body suggests `density-clustering`, but that package only exposes DBSCAN / OPTICS / KMEANS — it does not implement HDBSCAN despite the spec phrasing. The other npm options are GPL-3.0 (`hdbscan@0.0.1-alpha.5`), unmaintained since 2017 (`hdbscanjs@1.0.12`, Node 6 era, ships a `geolib` dependency), or absent. Choosing a clustering library is therefore a deliberate trade-off, not a copy-from-spec.
2. **Cosine distance over non-unit-normalized 1024-dim vectors.** The `pplx-embed-v1-0.6b` embeddings ([ADR-043](043-pgvector-on-neon-pplx-embed.md)) are not guaranteed L2-normalized at write time, so any clustering library that defaults to Euclidean must be fed a custom distance function — silently substituting Euclidean would make every "epsilon" knob meaningless.
3. **`mergeCanonicals` wraps `transactional()`, and the task contains many LLM calls.** Holding one transaction over the whole task starves the connection pool ([ADR-044](044-entity-resolution-transactional-pattern.md) §2 covers the same trade-off for the resolver). Each merge must be its own transaction; a failed merge must not roll back successful merges.

A fourth correctness defect in the spec body must be guarded: **issue #389's Phase 6 says "recompute `episode_count` for affected winners"**, but PR #424 (commit 558f7f2) dropped the `episode_count` column from `canonical_topics` — the count is now derived from `episode_canonical_topics` at read time. A reconciliation task that adds the column back, or writes to a column that does not exist, would either crash the task or re-introduce the drift bug #424 fixed. Reconciliation must surface the count as a true drift _delta_ (post − pre), not a DB write — and the pre-merge snapshot must be captured _inside_ the cluster loop, not at the start of the task, so concurrent resolver writes are correctly attributed to ingestion rather than reconciliation.

A fifth concern is **operational, not correctness**: the issue body's VERIFY shorthand for the pairwise-rejection test ("rejects entire cluster if any loser fails") reads as "strict reject" in isolation, but the issue's own test scenario ("loser1 verifies yes, loser2 verifies no → only loser1 merges") is per-pair partial-accept. The two readings give opposite implementations. This ADR adopts per-pair partial-accept as the authoritative interpretation (see §2) and locks the test scenario as the operational definition.

A sixth concern is the **`maxDuration: 600s` ceiling**. With `eps = 0.10` a burst-ingestion week could produce 50–200 multi-member clusters; at `1 + (size-1)` LLM calls per cluster and 2–5s per call, a high-volume run can blow past 600s and Trigger.dev SIGKILLs the task before Phase 8's `reconcile_summary` log emits — the dashboard goes silent on partial runs, the worst possible failure mode. An internal time-budget guard is required; `maxAttempts` retry alone does not fix it.

A seventh concern is **cross-cluster loser overlap**. Classical DBSCAN guarantees disjoint clusters, but `density-clustering` v1.3.0 with a custom distance function is not contractually guaranteed to honor that — and a duplicate merge attempt against an already-`merged` row throws `not-active`, which the per-merge catch logs as `mergesFailed`. Without a separate counter, the dashboard cannot distinguish "library bug" from "actual operational failure." A defensive `Set<number>` guard converts the case into a named, observable signal.

## Decision

### 1. Candidate generation: DBSCAN over `density-clustering` with a custom cosine distance function

`density-clustering` (npm, MIT, v1.3.0) is the smallest mature option available. It exposes a `DBSCAN` class with a pluggable distance function — `DBSCAN.run(dataset, eps, minPts, distanceFn)` — and DBSCAN is sufficient for the candidate-generation role this pipeline assigns to clustering. **HDBSCAN is not required**: the spec uses clustering only to surface multi-member groups for the LLM judge; the LLM is the actual decision-maker, and DBSCAN noise points (singleton or low-density rows) are dropped before any LLM call anyway.

The custom distance function is `cosineDistance(a, b) = 1 - dot(a,b) / (norm(a) * norm(b))`. Norms are computed inline; vectors are not pre-normalized because the embedding write path does not guarantee unit norm. Tests assert `cosineDistance(v, v) === 0` and `cosineDistance(v, -v) === 2` to lock the orientation against a future "let's just use Euclidean" regression.

Tunable constants:

- `RECONCILE_DBSCAN_EPS = 0.10` — cosine-distance ceiling for two canonicals to be considered neighbors. Equivalent to cosine similarity ≥ 0.90, slightly looser than the resolver's 0.92 auto-match threshold (ADR-042). Rationale: reconciliation operates on canonicals that survived the resolver — different surface forms of the same entity that landed below 0.92 cosine at ingestion. The looser ceiling is the entire reason this pass exists. Tunable in `src/lib/reconcile-constants.ts` without schema change.
- `RECONCILE_DBSCAN_MIN_POINTS = 2` — minimum cluster size; matches the spec.

**Why not HDBSCAN.** HDBSCAN's only structural advantage over DBSCAN here would be hierarchical density — clusters of varying density inside one corpus. The active-canonical filter (`status='active' AND last_seen > now() - 30 days`) bounds the input to a relatively homogeneous neighborhood; DBSCAN's flat density assumption is fine. The cost of HDBSCAN — pulling in `hdbscan@0.0.1-alpha.5` (GPL-3.0, alpha) or running a Python subprocess (adds Python runtime requirement to the Trigger.dev machine, which is not currently guaranteed) — is structurally worse than the cost of "DBSCAN with a slightly-tuned epsilon."

**Why not the Python subprocess fallback** the issue mentions. Trigger.dev machines do not ship Python by default. Adding a runtime dependency to the task image to use a clustering library when the LLM is the actual decision-maker is unjustified complexity. If post-launch data shows DBSCAN's flat-density assumption hurts merge recall, the next iteration can introduce a `trigger.config.ts` build extension (`pythonExtension`) and swap the helper — the cluster helper's input/output contract (`{ id, embedding }[] → { clusters: number[][] }`) is library-agnostic.

### 2. Pairwise winner-vs-loser verification — per-pair partial-accept (NOT group-judge, NOT cluster-strict-reject)

Each multi-member cluster runs through two LLM stages, both with Zod-validated JSON outputs:

**Stage A — winner-pick (1 call per cluster).** Pass `{ id, label, summary, kind }` for every member; ask the model to pick the most-canonical id, or `null`. Output schema: `z.object({ winner_id: z.union([z.number().int(), z.null()]) })`. `null` aborts the cluster (spec R3: skip on no-confidence). `winner_id` not in the cluster's id set → also abort the cluster (model hallucination guard).

**Stage B — pairwise verify (N-1 calls per cluster), per-pair partial-accept.** For each loser, ask: "Is this loser the same real-world entity as this winner?" Output schema: `z.object({ same_entity: z.boolean() })`. **Each loser's verdict is independent**: a loser that returns `same_entity=true` joins the merge set; a loser that returns `false` is skipped (no merge for that pair); a loser whose verify call throws is also skipped (and increments `pairwiseVerifyFailed` for observability). After the cluster's loser loop completes, the verified set is merged.

The operational definition is the test scenario the issue body specifies verbatim:

> "Test pairwise rejection: cluster of 3 where loser1 verifies 'yes' but loser2 verifies 'no' → **only loser1 merges**."

That is, "rejection" applies to the _individual pair_, not the _cluster_. The cluster's grouping claim ("DBSCAN said these N rows are one entity") is what gets rejected when verification disagrees; the pair-level decisions ("is loser_i the same entity as winner?") still stand independently because the LLM evaluated them independently.

**This is NOT a relaxation of R3 (over-merge prevention).** R3 is satisfied at the pair level: a pair the LLM did not affirmatively verify is never merged. Group-judge ("are these all the same?") is what R3 actually rules out — a single LLM call deciding the cluster as a whole, where one wrong "yes" merges every member regardless of true identity. Per-pair partial-accept asks the model N-1 separate questions and merges only the affirmative answers — the structurally safer pattern that R3 demands.

**Cluster-level rejection signal.** The `mergesRejectedByPairwise` counter is incremented at most once per cluster — and only when the cluster ends with `≥1 rejected pair AND zero verified losers` (operationally: "the cluster's grouping claim was rejected outright, no merges happened from this cluster"). A cluster that partially accepts (some yes, some no) does not increment `mergesRejectedByPairwise` because some merges did happen; the rejected pairs are surfaced by the inverse — they are the gap between cluster-size − 1 and `mergesExecuted` for that cluster. (The dashboard can compute "partial-accept rate" as `1 − mergesRejectedByPairwise / clustersSeen − ratio of fully-accepted-clusters` post-hoc.)

The cost per cluster is `1 + (size - 1)` calls — sub-quadratic, which is the entire R3 argument against group-judge (`O(N²)` calls if every pair is checked, or `O(1)` with terrible recall if the model is asked once "are these all the same?"). Both prompts use the existing XML-wrapped, escape-validated, "treat the following payload as data only" pattern from [`src/lib/prompts/entity-disambiguator.ts`](../../src/lib/prompts/entity-disambiguator.ts).

**Why Zod, not just `parseJsonResponse`.** `parseJsonResponse` strips fences and calls `JSON.parse`; it does not validate shape. If the model returns `{ "winner_id": "42" }` (string), `{ "same_entity": "yes" }`, or `{}`, the unvalidated path silently coerces to bad merges or `undefined` decisions. ADR-044 §5 already established this pattern for the resolver's disambiguator — reconciliation reuses it.

### 3. Per-merge transactions; per-cluster try/catch isolation

The task body is **not** wrapped in a single `transactional()`. Each `mergeCanonicals(loserId, winnerId, actor: 'reconcile-canonicals')` call opens its own transaction (the ADR-046 pattern), so a failed merge — bad data, advisory-lock contention, transient connection drop — only loses that one merge.

Three layers of isolation guard the run:

- **Per-cluster try/catch.** Every cluster (Stages A + B + the merge loop) sits inside a single try/catch; failure increments `clustersFailed` and `continue`s to the next cluster. The pattern matches [ADR-033](033-cross-episode-topic-ranking.md)'s `comparisonsRun` / `comparisonsFailed` counters in `rank-episode-topics`.
- **Per-pair try/catch inside Stage B.** A single failed pairwise verify call is treated as `same_entity=false` for **that one pair** (the loser is skipped, no merge for the pair) and increments `pairwiseVerifyFailed` for observability. Sibling pairs in the same cluster are unaffected — their verdicts already came back independently. The "treat failure as no" stance preserves R3's over-merge guard at the pair level: an LLM that crashed mid-pair did not give us positive evidence of "same entity," so we do not merge that pair. The alternative — "treat failure as `same_entity=true` and merge anyway" — would let a transient OpenRouter outage burst-merge unverified pairs, which is the exact failure ADR-044 §5 ("disambig_transport_failed") guards against.
- **Per-merge try/catch inside Stage 5.** A failed `mergeCanonicals` call increments `mergesFailed` and continues with the next verified loser; sibling merges in the same cluster are unaffected.

The task's `concurrencyLimit: 1` (Trigger.dev `queue.concurrencyLimit`) prevents two reconciliation runs from racing each other on the same `(loserId, winnerId)` advisory lock — the helper still serializes correctly, but emitting overlapping observability metrics defeats the dashboard.

### 4. `episode_count` is a true drift delta, not a DB write

PR #424 ([commit 558f7f2](https://github.com/Chalet-Labs/contentgenie/commit/558f7f2)) dropped the `canonical_topics.episode_count` column. The count is now derived from `episode_canonical_topics` at read time via the helper extracted in that PR. Any reconciliation code that issues `UPDATE canonical_topics SET episode_count = …` would target a non-existent column and crash at runtime; any code that adds the column back would re-introduce the drift bug #424 fixed.

Phase 6 of the issue body — "recompute `episode_count` for affected winners" — is therefore re-interpreted as a **true drift signal**: the sum, across affected winners, of `postCount − preCount`. The pre-merge count is captured lazily inside the cluster loop, _immediately before the first merge to a given winner_, so it reflects the junction's state just before reconciliation touched it (concurrent resolver writes between Phase 1 and Phase 5 are correctly attributed to "ingestion," not "reconciliation drift"). The post-merge count is read after all merges complete in Phase 6.

```ts
// Inside the cluster loop, before mergeCanonicals(...)
if (!preMergeCounts.has(winnerId)) {
  preMergeCounts.set(winnerId, await countEpisodesForCanonical(winnerId));
}

// Phase 6, after all merges
let episodeCountDrift = 0;
for (const winnerId of affectedWinners) {
  const post = await countEpisodesForCanonical(winnerId);
  const pre = preMergeCounts.get(winnerId) ?? 0;
  episodeCountDrift += post - pre;
}
```

Naming the metric `episodeCountDrift` (rather than `episodeCountPostMerge`) is load-bearing: operators reading the dashboard expect a delta, and shipping a delta is structurally feasible because we control the lazy-capture point. The captured-pre-then-measured-post pattern eliminates the "drift counter is actually a sum of absolute counts" footgun that an earlier draft of this design fell into. The same `countEpisodesForCanonical` function is the source of truth for read-side counters everywhere else in the app, so divergence between the metric and the UI is structurally impossible.

### 5. Decay step — pure SQL UPDATE, no LLM

ADR-042 §"Decay and the `ongoing` flag" specifies the rule. Reconciliation issues exactly one UPDATE at the end of the task:

```sql
UPDATE canonical_topics
   SET status = 'dormant'
 WHERE status = 'active'
   AND ongoing = false
   AND kind IN ('release','incident','regulation','announcement','deal','event')
   AND last_seen < now() - INTERVAL '180 days'
RETURNING id;
```

`other` is **not** in the kind whitelist — ADR-042 line 104 lists it as event-type for decay purposes, but the issue spec narrows the whitelist to the six concrete event kinds. The plan follows the issue spec (the narrower set), and the deviation is documented here so a future reader can find the divergence; the broader interpretation can be added in a follow-up if the dashboard shows `other`-kind canonicals piling up. Topic-type kinds (`concept`, `work`) are excluded by construction (not in the IN list); `ongoing=true` is exempt by the explicit predicate. The `RETURNING id`-derived row count is emitted as `dormancyTransitions`.

The UPDATE runs after the merge phase so canonicals that were just merged-away (status flipped to `'merged'`) are not re-flipped (`'merged' != 'active'` filters them out). The order also means a freshly active canonical produced by an unmerge — improbable in the same task window, but possible — is correctly evaluated for decay in the same run.

### 6. Time-budget guard — `RECONCILE_BUDGET_MS = 540_000`

Trigger.dev kills the task at `maxDuration: 600` seconds. Without an internal budget guard, a burst-ingestion week (50–200 multi-member clusters at `1 + (size-1)` LLM calls × 2–5s each) blows past the ceiling, the runtime SIGKILLs the process mid-cluster, and Phase 8's `reconcile_summary` log never emits — the nightly dashboard goes silent, which is the worst possible failure mode (no signal of "we ran" + no signal of "we are progressing"). The retry would then re-attempt from scratch on the same input set, hit the same ceiling, and the operator sees only a generic "task killed" alert.

The guard is a single-line check at the top of every cluster iteration:

```ts
const startMs = now().getTime();
for (const cluster of multiMemberClusters) {
  if (now().getTime() - startMs > RECONCILE_BUDGET_MS) {
    clustersDeferred += multiMemberClusters.length - processedCount;
    break; // fall through to Phase 6/7/8 — summary always emits
  }
  // ... Stage A, Stage B, Phase 5 merge loop ...
  processedCount++;
}
```

`RECONCILE_BUDGET_MS = 540_000` (90% of `maxDuration`) leaves ~60s of headroom for Phase 6 (per-winner `count(*)` queries), Phase 7 (single decay UPDATE), and Phase 8 (logger emit). The deferred clusters re-form on the next nightly run — the active+30d filter persists them, the resolver does not modify them in the meantime (resolver only writes new canonicals, never modifies existing ones), and DBSCAN re-clusters them deterministically. No backlog table, no priority queue — the data model is the durable contract, same shape as §8 idempotence.

`clustersDeferred` is a first-class observability counter so operators can trend "what fraction of nights hit the ceiling?" If the answer trends above ~10%, the task needs a `maxDuration` bump or `RECONCILE_DBSCAN_EPS` retighten — both are tunable without an ADR change.

### 7. Cross-cluster loser guard — `mergedLoserIds: Set<number>`

Classical DBSCAN produces disjoint clusters by definition (a point belongs to exactly one cluster or is noise). However, `density-clustering` v1.3.0 is unmaintained, thinly documented, and its behavior with a custom distance function is not contractually guaranteed to honor the disjoint property. A defensive guard is one cheap line and converts a potential silent-corruption mode (same loser merged twice → second merge throws `not-active` → counted as `mergesFailed` → dashboard shows phantom failures on otherwise-clean runs) into a deliberate, named signal:

```ts
const mergedLoserIds = new Set<number>();
// ... inside Phase 5 merge loop ...
if (mergedLoserIds.has(loser.id)) {
  mergesSkippedAlreadyMerged++;
  continue;
}
await mergeCanonicals({
  loserId: loser.id,
  winnerId,
  actor: "reconcile-canonicals",
});
mergedLoserIds.add(loser.id);
```

`mergesSkippedAlreadyMerged` lets the dashboard separate "the LLM disagreed with itself across clusters" (legitimate, expected) from "an actual merge failed" (`mergesFailed` — operator action). On a healthy run both stay near zero; on a run with a buggy clustering library, the former rises while the latter stays flat — a clean signal.

### 8. Idempotence by construction

A second run within the same UTC day produces zero merges:

- Phase 1's `WHERE status='active'` filter excludes losers from the first run (their status flipped to `'merged'`).
- The same kNN neighborhood now contains only the winner — DBSCAN's `min_points = 2` filter drops the singleton cluster.
- The decay UPDATE's `WHERE status='active'` predicate blocks re-decay of already-dormant rows.
- Deferred clusters from the previous run (Phase 6 budget guard) re-form unchanged on the next run.

No idempotence key, no run-id table, no de-dup logic. The data model (`status` enum + `merged_into_id` self-FK + the partial unique index from ADR-042) is the durable contract.

### 9. Trigger.dev task configuration

```ts
schedules.task({
  id: "reconcile-canonicals",
  cron: "0 3 * * *", // 03:00 UTC — no collision with generate-trending-topics (06:00) or rank-episode-topics (07:00)
  maxDuration: 600, // 10-min ceiling matches rank-episode-topics
  retry: { maxAttempts: 2 },
  queue: { concurrencyLimit: 1 },
  machine: "medium-1x", // 2 GB — DBSCAN over thousands of 1024-dim vectors needs more than the default 0.5 GB
  run: async () => {
    /* ... */
  },
});
```

`machine: "medium-1x"` is the first explicit machine override in the codebase. The default `small-1x` (0.5 GB) is fine for IO-bound tasks; DBSCAN's `O(N²)` distance-function calls over 1024-dim Float32 vectors at the projected 5K-canonical scale (~5GB of pairwise ops in transient memory, plus the embedding tensor itself at ~20 MB) will exceed the default. The `maxAttempts: 2` is a deliberate downshift from the global `default.maxAttempts: 3` — a reconciliation that crashed once almost certainly hit a real bug, not a transient blip; we want a stable signal in the dashboard, not a green tick on retry that hides what failed.

## Options Considered

- **Use `density-clustering` and pretend it has HDBSCAN** (the spec's literal suggestion). Rejected — the package does not implement HDBSCAN, and shipping code that says "HDBSCAN" while running DBSCAN is a documentation lie that the next contributor will rebuild against.
- **Pull in `hdbscan@0.0.1-alpha.5` (GPL-3.0).** Rejected — license is incompatible with commercial use and the version number ("0.0.1-alpha.5") is a stability signal we cannot ignore in a nightly job that mutates production data.
- **Pull in `hdbscanjs@1.0.12`** (MIT). Rejected — last published in the Node 6 era, ships a `geolib` dependency, and has not received a CVE patch in ~9 years. The risk profile is worse than DBSCAN-with-a-clearer-API.
- **Spawn a Python subprocess running `hdbscan` (Python).** Rejected for the v1 task — Trigger.dev machines do not ship Python by default; introducing a build extension to install it is unjustified for a candidate-generator role the LLM second-passes anyway. Revisit if post-launch data shows DBSCAN's flat-density assumption hurts merge recall.
- **Hand-roll an inline TypeScript HDBSCAN over a cosine MST.** Rejected — feasible at sub-5K canonical scale, but the maintenance burden (mutual reachability distance, condensed tree, cluster stability scoring) is unjustified before we have empirical data showing DBSCAN under-clusters.
- **Single transaction wrapping the whole task body.** Rejected — same reason as ADR-044 §2: holding a transaction across an LLM round-trip starves the connection pool; doing it across N LLM round-trips guarantees pool exhaustion under any non-trivial cluster count. Per-merge transactions is the correct shape.
- **Group-judge prompt** ("are these all the same entity?"). Rejected — known over-merge mode (ADR-042 §"Pairwise winner-vs-loser verification" — and the spec's R3). The pairwise-verification cost is `1 + (N-1)` per cluster, which is sub-quadratic and structurally safer than the `O(1)` group-judge.
- **Cluster-strict-reject** (zero merges from a cluster on the first `same_entity=false`). Rejected — contradicts the issue body's own test scenario ("loser1 verifies yes, loser2 verifies no → only loser1 merges"). The strict-reject reading conflates the cluster's _grouping claim_ ("DBSCAN said these N rows are one entity") with the _per-pair entity claim_ ("loser_i is the same entity as winner"); only the former is what the LLM rejects when one pair returns `false`. The latter is unaffected — the LLM evaluated each pair independently and gave us its independent verdict for each. Per-pair partial-accept respects R3 at the pair level (a failed pair is never merged, regardless of cluster-mate outcomes) while keeping the merges the LLM did affirmatively verify.
- **Treat a Stage B verify-throw as `same_entity=true` and merge anyway** (so transient outages still produce the merges DBSCAN suggested). Rejected — same trap as ADR-044 §5: a transient OpenRouter outage would burst-merge unverified pairs, the exact failure mode the disambiguator's "treat-failure-as-no" stance was added to prevent. We ship merges only on positive evidence.
- **Track verified pairs across the whole task and merge them at the end (single Phase 5 sweep).** Rejected — equivalent to the pre-existing per-cluster Phase 5 sweep but with worse failure isolation. A single failure batch-aborts more work; per-cluster Phase 5 keeps the blast radius at one cluster.
- **Keep `parseJsonResponse` without Zod.** Rejected — same trap as ADR-044 §5 ("disambig_parse_failed"). A model that returns the wrong shape on a transient bad day is a model that mints bad merges; Zod between parse and use is the only correctness guarantee.
- **Re-introduce the `episode_count` column as a denormalized counter that reconciliation maintains.** Rejected — that is exactly what PR #424 removed because the resolver's `insertJunction` was not bumping it. Any new writer (reconciliation) does not fix the read drift caused by the absent writer (resolver). The derived-at-read-time path is correct; reconciliation only needs the count for observability.
- **Continue retrying a failed cluster within one run.** Rejected — a cluster that failed Stage A or had a Stage B LLM crash is a cluster the model could not give us a confident decision on. A retry inside the same run on the same input is unlikely to produce a different answer; on the next run the cluster will re-form (assuming both members still meet the active+30d filter) and we will try again with fresh model state. Bounded, observable, no infinite-retry pathology.
- **Wider decay kind set including `other`.** Considered. ADR-042 line 104 lists `other` as event-type for decay purposes; the issue spec narrows it to six concrete kinds. We follow the issue (narrower) and document the deviation here so a follow-up can revisit if `other` rows pile up.

## Consequences

### Positive

- The reconciliation task ships with a clearly-documented clustering choice that matches the actual library — no copy-from-spec mistake bakes in.
- The pairwise-verification stage retains the R3 over-merge guard at the pair level — failed pairs are never merged — while preserving the merges the LLM did affirmatively verify (per-pair partial-accept).
- Per-merge transactions keep the task progress-preserving under partial failure: 7 successful merges out of 8 commit; the 8th's failure is logged and the run continues.
- The `RECONCILE_BUDGET_MS` time guard means `reconcile_summary` always emits — the dashboard is never silent on a partial run, even when LLM-call wall-time blows past the budget.
- Cross-cluster overlap is observable (`mergesSkippedAlreadyMerged`) instead of silently inflating `mergesFailed`.
- `episodeCountDrift` is a true delta — operators reading the dashboard get a change quantity, not a sum of absolute counts.
- Idempotence is a property of the data model, not a property of the task implementation. No state to maintain.
- `episode_count` stays derived (per #424), so reconciliation cannot re-introduce the drift bug.

### Negative

- DBSCAN's flat-density assumption may under-cluster when the active-canonical neighborhood is heterogeneous (e.g., a launch week where AI releases and finance regulations both spike). Mitigation: the looser `eps = 0.10` is tuned with that case in mind; revisit on post-launch data.
- `density-clustering` is small but unmaintained-ish — last release was 2021. The library surface is tiny and the custom distance function path is well-exercised by other consumers (the package is widely used). Acceptable; we pin to exact `1.3.0` in `package.json` (no caret) so a stealth republish cannot auto-roll into nightly production.
- Per-pair partial-accept means a single Stage B verdict is load-bearing for one merge — false negatives from the LLM cost recall (we lose the merge) and false positives cost precision (we ship a bad merge). Mitigation: the prompt is constrained to "same real-world entity" with explicit examples (different versions / years / editions are NOT the same entity), inheriting the disambiguator's tightened framing from ADR-042. Post-launch we have `mergesRejectedByPairwise` and the `match_method` histogram to retune.
- The time-budget guard means a high-volume run only processes a prefix of the cluster set; the remainder waits one day. Mitigation: the active+30d filter means a deferred cluster's members do not age out before the next run; a 1-day delay on a recovery pass is well within tolerance for a system that already accepts duplicates at ingestion time.
- One more module-level constant file (`src/lib/reconcile-constants.ts`) joins the existing `src/lib/entity-resolution-constants.ts`. The split keeps the constants out of `src/db/schema.ts` and dodges the "widely-mocked module re-export" hazard from MEMORY.md.

## References

- Issue: [#389](https://github.com/Chalet-Labs/contentgenie/issues/389)
- [ADR-022](022-trending-topics-snapshot.md) — daily scheduled-snapshot pattern, retry-aware persistence
- [ADR-033](033-cross-episode-topic-ranking.md) — pairwise LLM judge pattern, per-item try/catch isolation, `comparisonsRun` / `comparisonsFailed` counters
- [ADR-042](042-canonical-topics-foundation.md) — canonical-topic data model, decay rules, pairwise-vs-group rationale, derived `episode_count`
- [ADR-044](044-entity-resolution-transactional-pattern.md) — Pool-backed `transactional()`, two-phase split, Zod on LLM responses
- [ADR-046](046-admin-canonical-merge.md) — `mergeCanonicals` helper, sorted-pair advisory lock, biconditional UPDATE
- PR [#424](https://github.com/Chalet-Labs/contentgenie/pull/424) (commit `558f7f2`) — dropped `canonical_topics.episode_count`; reconciliation must respect this
- `density-clustering` (npm, MIT) — DBSCAN implementation with pluggable distance function
