import { sql, type SQL } from "drizzle-orm";
import { canonicalTopics, episodeCanonicalTopics } from "@/db/schema";

/**
 * Correlated subquery that returns the live junction-row count for the
 * outer `canonical_topics` row. Use as a select projection:
 *
 *   db.select({ episodeCount: canonicalTopicEpisodeCount(), ... })
 *     .from(canonicalTopics)
 *
 * The outer reference must be fully qualified. Both `canonical_topics` and
 * `episode_canonical_topics` have an `id` column, so a bare `id` inside the
 * subquery would bind to the inner FROM (the junction PK) under Postgres's
 * innermost-scope resolution — silently returning 0 instead of correlating
 * to the outer row. Drizzle's `${canonicalTopics.id}` interpolates as bare
 * `"id"` with no table qualifier, so we write it explicitly as
 * `${canonicalTopics}.${canonicalTopics.id}` → `"canonical_topics"."id"`.
 * The `ect` alias is just a shorthand; safety comes from the qualification.
 */
export function canonicalTopicEpisodeCount(): SQL<number> {
  return sql<number>`(SELECT count(*) FROM ${episodeCanonicalTopics} ect WHERE ect.canonical_topic_id = ${canonicalTopics}.${canonicalTopics.id})`.mapWith(
    Number,
  );
}
