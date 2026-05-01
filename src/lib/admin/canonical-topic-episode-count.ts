import { sql, type SQL } from "drizzle-orm";
import { canonicalTopics, episodeCanonicalTopics } from "@/db/schema";

/**
 * Correlated subquery that returns the live junction-row count for the
 * outer `canonical_topics` row. Use as a select projection:
 *
 *   db.select({ episodeCount: canonicalTopicEpisodeCount(), ... })
 *     .from(canonicalTopics)
 *
 * The `ect` alias is required: without it, Postgres resolves the subquery's
 * own `id` column (the junction PK) before correlating outward, silently
 * returning 0. Drizzle's `${canonicalTopics.id}` interpolates as bare `"id"`
 * with no table qualifier, so the outer reference is written explicitly as
 * `${canonicalTopics}.${canonicalTopics.id}` → `"canonical_topics"."id"`.
 */
export function canonicalTopicEpisodeCount(): SQL<number> {
  return sql<number>`(SELECT count(*) FROM ${episodeCanonicalTopics} ect WHERE ect.canonical_topic_id = ${canonicalTopics}.${canonicalTopics.id})`.mapWith(
    Number,
  );
}
