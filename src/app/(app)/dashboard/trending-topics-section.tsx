import { getTrendingTopics } from "@/app/actions/dashboard";
import { TrendingTopics } from "@/components/dashboard/trending-topics";
import { isTrendingSnapshotStale } from "@/lib/trending";

export async function TrendingTopicsSection() {
  const { topics, error } = await getTrendingTopics();
  if (error) console.error("[TrendingTopicsSection]", error);
  // No snapshot at all → hide the section entirely (first-run dashboards).
  if (!topics) return null;
  // Snapshot exists but may be empty or stale → render the card so the header
  // (with "Updated N days ago" / empty-state copy) makes the feature's status
  // visible, instead of silently disappearing.
  return (
    <TrendingTopics
      topics={topics.items}
      generatedAt={topics.generatedAt}
      isStale={isTrendingSnapshotStale(topics.generatedAt)}
    />
  );
}
