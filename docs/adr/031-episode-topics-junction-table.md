# ADR-031: Episode Topics Junction Table

**Status:** Accepted
**Date:** 2026-04-11

## Context

Issue #259 adds per-episode topic tag extraction during summarization. The topic data needs to be persisted so it can be queried across episodes (e.g., "all episodes tagged with 'AI & Machine Learning'"). Two schema options were considered:

1. **JSON column on `episodes`**: Add a `topics jsonb` column to the existing `episodes` table.
2. **Junction table `episode_topics`**: A separate table with `(episodeId, topic, relevance)` and a unique index on `(episodeId, topic)`.

## Decision

Use a junction table (`episode_topics`) rather than a JSON column on `episodes`.

## Rationale

### Cross-episode queries require an indexed table

The primary value of topic tags is enabling queries like "find all episodes tagged with 'Product Management'". Against a JSON column this requires a full table scan plus per-row JSON parsing — O(N×JSON parse). Against the junction table's `episode_topics_topic_idx` index, it is O(index lookup). As the episode corpus grows, the JSON approach degrades while the index stays fast.

### Contrast with `trendingTopics`

The `trendingTopics` table (see ADR-022) stores topics as a JSON snapshot column. That is appropriate because trending topics are time-series aggregates — the unit of lookup is the snapshot row, not an individual topic. Episode topics have the opposite access pattern: the individual topic is the unit of lookup. The same JSON-blob approach would be wrong here.

### Idempotent inserts via `onConflictDoNothing`

Trigger.dev tasks can be retried on failure. Using `onConflictDoNothing` on the unique `(episodeId, topic)` index makes topic persistence idempotent: a retry will not fail or create duplicates. We do not update relevance on conflict — if the LLM produces a different score on retry, neither score is authoritative and the complexity of resolving it is not justified for v1.

### No Drizzle transaction

The episode update/insert and topic insert are sequential awaits without a `db.transaction()`. See ADR-006 section in plan for full rationale. In summary:

- **Failure mode is benign**: An episode with a valid summary but no topics is not data-corrupting — the summary is still correct and visible.
- **Retries are self-healing**: Trigger.dev retries + `onConflictDoNothing` idempotency mean a subsequent run will re-attempt the topic insert cleanly.
- **Transaction overhead is real**: Neon serverless reconnects per request; holding a connection across two round-trips adds latency.

If topic persistence becomes critical enough that partial writes are unacceptable, add a transaction then.

### Custom prompts intentionally bypass topic extraction

`getSummarizationPrompt` is updated to request topics in its JSON format; `interpolatePrompt` (used for custom prompts) is not. Custom prompts are user-supplied and may target specific model formats — silently injecting a topics requirement could break them. Because `topics` is optional on `SummaryResult`, a custom prompt that happens to return topics will still benefit from normalization and persistence; it just is not guaranteed.

## Consequences

- Cross-episode topic queries are O(index lookup) rather than O(N×JSON parse).
- `persistEpisodeSummary` gains a second DB round-trip (topic insert) when topics are present. The round-trip is skipped when `summary.topics` is empty or undefined.
- Schema migration: `bun run db:push` must be run against production before the summarization code ships. Failure to do so will cause runtime errors on task execution (see the `worth_it_reason` column incident in project memory).
- Existing episode rows are unaffected — the table is additive. No backfill is required by this issue.

## Related ADRs

- ADR-022: `trendingTopics` uses JSON snapshot column — contrasting access pattern.
- ADR-027: `summarize-episode` pure-consumer pattern — the pipeline this change extends.
