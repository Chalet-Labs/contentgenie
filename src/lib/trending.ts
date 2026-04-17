import type { TrendingTopic } from "@/db/schema";
import { slugify } from "@/lib/utils";

// Trending snapshots regenerate daily; allow one missed cycle before flagging.
export const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

export function isTrendingSnapshotStale(generatedAt: Date | null | undefined): boolean {
  if (!generatedAt) return false;
  return Date.now() - generatedAt.getTime() > STALE_THRESHOLD_MS;
}

// Pre-#279 JSON rows lack a slug key at runtime even though the TS type claims
// it is required; derive it from the name for backward compatibility.
export function getTopicSlug(topic: TrendingTopic): string {
  return topic.slug ?? slugify(topic.name);
}
