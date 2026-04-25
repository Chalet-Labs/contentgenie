/**
 * Branded id types for compile-time namespace disambiguation.
 *
 * Each namespace in the codebase that carries a structurally identical `string`
 * but a distinct semantic identity gets its own brand. Runtime validation
 * (zod, route-param parsing, DB lookups) is a separate concern handled at
 * external-input boundaries — the constructors here are compile-time tools only.
 */

/**
 * The stringified PodcastIndex episode id — the canonical identifier used in
 * URLs, server-action params, and component props to address a specific episode.
 *
 * Sourced from `PodcastIndexEpisode.id` (number|string from the PI API) via
 * `String(...)`, or read from `episodes.podcastIndexId` /
 * `listenHistory.podcastIndexEpisodeId` columns (which carry this brand via
 * Drizzle `$type<PodcastIndexEpisodeId>()`).
 *
 * Not to be confused with:
 * - `episodes.id` — the DB-internal serial integer id (`number`).
 * - `podcasts.podcastIndexId` — the PI *podcast* id namespace (different entity).
 */
export type PodcastIndexEpisodeId = string & {
  readonly __brand: "PodcastIndexEpisodeId";
};

/**
 * Compile-time constructor. Cast a validated/trusted string into the
 * PodcastIndex episode id namespace. Not a runtime check.
 */
export function asPodcastIndexEpisodeId(s: string): PodcastIndexEpisodeId {
  return s as PodcastIndexEpisodeId;
}
