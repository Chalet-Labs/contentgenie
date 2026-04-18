import type { TrendingTopic } from "@/db/schema";
import { slugify } from "@/lib/utils";

// Trending snapshots regenerate daily; allow one missed cycle before flagging.
export const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

export function isTrendingSnapshotStale(generatedAt: Date | null | undefined): boolean {
  if (!generatedAt) return false;
  return Date.now() - generatedAt.getTime() > STALE_THRESHOLD_MS;
}

// Pre-#279 JSON rows lack a slug key at runtime even though the TS type claims
// it is required; derive it from the name for backward compatibility. Uses `||`
// (not `??`) so empty-string slugs from stale snapshots also fall back — an
// empty slug would otherwise render as "/trending/".
export function getTopicSlug(topic: TrendingTopic): string {
  // Empty-string slugs are distinct from legacy missing slugs (pre-#279); log
  // them so a real upstream data regression doesn't look identical to expected
  // legacy rows once pre-#279 snapshots age out.
  if (topic.slug === "") {
    console.warn("Trending topic has empty-string slug; falling back to slugify(name):", {
      name: topic.name,
    });
  }
  return topic.slug || slugify(topic.name);
}

// Dedupe topics by their resolved slug so two topics with a shared display name
// but distinct slugs both survive, and two topics with the same slug collapse
// to one. Returns `{ topic, slug }` pairs so callers can reuse the computed
// slug without calling `getTopicSlug` again (which would duplicate the
// empty-slug console.warn per topic per render).
export function dedupeTopics(
  topics: TrendingTopic[],
): Array<{ topic: TrendingTopic; slug: string }> {
  const withSlugs = topics.map((topic) => ({ topic, slug: getTopicSlug(topic) }));
  return Array.from(new Map(withSlugs.map((e) => [e.slug, e])).values());
}
