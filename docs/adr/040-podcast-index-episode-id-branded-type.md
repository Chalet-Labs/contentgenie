# ADR-040: PodcastIndexEpisodeId Branded Type for Compile-Time ID Disambiguation

**Status:** Accepted
**Date:** 2026-04-25
**Issue:** [#352](https://github.com/Chalet-Labs/contentgenie/issues/352)

---

## Context

ContentGenie carries three episode-id namespaces that are structurally indistinguishable at the TypeScript level:

1. **DB internal id** — `episodes.id` (`serial` → `number`).
2. **PodcastIndex episode id** — stringified numeric id from the PodcastIndex API, persisted as `text` in `episodes.podcastIndexId` and `listenHistory.podcastIndexEpisodeId`. Used everywhere a client needs to address an episode (URLs, server-action params, denormalized prop arrays).
3. **Clerk user id** — `string`, unrelated but lives in the same plain-`string` type zoo.

The PI-episode-id namespace crosses a stringification seam any time a `PodcastIndexEpisode` arrives from the PodcastIndex API (where `id: number | string`) and gets normalised with `String(episode.id)` before being passed to ROUTES, server actions, or component props. A separate stringification seam exists at `String(dbEpisode.id)`, where a DB internal id is coerced — these two `string` results are indistinguishable to the type system, so a refactor can silently swap one for the other. The failure mode is "empty result set" at runtime, not a compile error.

PR #350 added two new surfaces that reinforce the problem with no compile-time guards:

- `listenedIds?: string[]` (`NotificationPageList`)
- `topicsByPodcastIndexId?: Record<string, string[]>` (`EpisodeList`, podcast page)

## Decision

Introduce a single branded type for the PodcastIndex _episode_ id namespace and apply it from the database column outward through every type-level boundary it crosses.

```ts
// src/types/ids.ts
export type PodcastIndexEpisodeId = string & {
  readonly __brand: "PodcastIndexEpisodeId";
};

// Compile-time tool only. Runtime validation (zod, route param parsing)
// is a separate concern handled at external-input boundaries.
export function asPodcastIndexEpisodeId(s: string): PodcastIndexEpisodeId {
  return s as PodcastIndexEpisodeId;
}
```

The brand is applied at the type origin via Drizzle's column-type hint (`text(...).$type<PodcastIndexEpisodeId>()`) on `episodes.podcastIndexId` and `listenHistory.podcastIndexEpisodeId`. From there, every consumer that selects the column inherits the branded type automatically — server actions, API responses, server components, denormalized rows, and (transitively) client component props.

`asPodcastIndexEpisodeId(...)` is inserted exactly once per external-input seam: where a raw `string` (from `String(numericId)`, JSON body, URL param, or zod schema output) crosses into the branded zone. Each insertion is paired with a one-line comment naming the source namespace.

### Scope

**In scope (gets the brand):**

- `episodes.podcastIndexId`, `listenHistory.podcastIndexEpisodeId` columns.
- `ROUTES.episode(id)` parameter.
- `AudioEpisode.id` and `EpisodeDenormRow.episodeId`.
- Server-action signatures that take or return PI episode ids (`recordListenEvent`, `isEpisodeSaved`, `saveEpisode`, `removeFromLibrary`, `getTopicsByPodcastIndexId`, etc.). _(`getQueueEpisodeScores` was in this list when ADR-040 landed; the action was removed in PR #401, closing issue #394.)_
- Component prop types: `listenedIds`, `knownIds`, `topicsByPodcastIndexId`, `initialListenedIds`.

**Out of scope (deferred until pain surfaces):**

- Separate brands for `DbEpisodeId` (`number`), `ClerkUserId` (`string`), or `PodcastIndexPodcastId` (`podcasts.podcastIndexId` is a distinct namespace from episode ids; it is _not_ mixed with PI-episode-ids in current code).
- Adding zod runtime validation at external-input boundaries (separate concern; brand is compile-time only).
- Refactoring `episode.id` consumers that use the PI-episode-id where a DB internal id might be more appropriate (semantic change, not a type cleanup).

### Why a single namespace, not three

Two of the three id types in the introduction (DB internal id, Clerk user id) are not currently mixed up with PI episode ids in any reachable code path that a senior reviewer would call a real risk. Branding only the namespace that demonstrably leaks (`String(dbEpisode.id)` flowing into a `listenedIds: PodcastIndexEpisodeId[]` slot) gives the compile-time safety we need with the minimum surface change. The pattern in `src/types/ids.ts` is a template — adding `DbEpisodeId` or `ClerkUserId` later is a 5-line follow-up if a real bug surfaces.

### Why an `as`-cast constructor, not a runtime check

The brand exists to disambiguate already-validated strings at the type level. Validation (length, character set, server-side existence check) happens elsewhere — at zod schemas for server-action inputs and at the DB lookup that resolves `eq(episodes.podcastIndexId, value)` to either a row or a 404. Forcing a runtime check inside `asPodcastIndexEpisodeId` would either duplicate validation already done at the boundary or introduce a half-measure that gives false confidence. The constructor is a typed `as`-cast, consistent with the issue's blueprint.

## Consequences

### Positive

- Passing `String(dbEpisode.id)` to a slot expecting `PodcastIndexEpisodeId[]` (or `Record<PodcastIndexEpisodeId, ...>`, or `ROUTES.episode(...)`, etc.) becomes a TypeScript error.
- Drizzle column results carry the brand transitively — most consumers don't need explicit casts; the brand "just appears" in row types.
- Future id-namespace brands (Clerk user id, podcast id, etc.) follow the exact same template.
- Zero runtime cost: branded strings erase to plain strings in emitted JS.

### Negative

- Every external-input boundary that produces a PI episode id now needs an explicit `asPodcastIndexEpisodeId(...)` cast at exactly one site. Roughly 30–40 such seams across the repo (DB-internal-id → PI-id stringifications, JSON body parses, route-param parses, Trigger.dev numeric-payload-to-string casts, test fixtures).
- Test fixtures that hand-construct mock data with PI episode id literals need a single `as PodcastIndexEpisodeId` cast (or call to the constructor) per literal. This is cosmetic and mechanical.
- The brand can be circumvented by an `as PodcastIndexEpisodeId` cast or by the constructor itself. This is by design — the brand is a hint to the compiler, not a fortress.

### Risks

- **Drift.** New code that constructs PI episode ids from external sources may forget to cast and instead widen surface types back to `string`. Mitigation: prop types are tightened at the closest point to the consumer (component props, server-action signatures), so the TS error surfaces at the call site, not deep inside a helper.
- **Drizzle `$type` regressions.** If a future schema migration drops `$type<PodcastIndexEpisodeId>()` from a column, downstream consumers silently fall back to plain `string` and the brand evaporates for that path. Mitigation: column-level `$type` lives in one file (`src/db/schema.ts`); a code-review checklist entry covers this when touching the schema.
