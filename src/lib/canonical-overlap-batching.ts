import {
  getCanonicalTopicOverlaps,
  MAX_OVERLAP_LOOKUP_IDS,
} from "@/app/actions/dashboard";
import type { CanonicalOverlapResult } from "@/lib/topic-overlap";
import type { PodcastIndexEpisodeId } from "@/types/ids";

export async function fetchCanonicalOverlapsBatched(
  ids: PodcastIndexEpisodeId[],
): Promise<Record<PodcastIndexEpisodeId, CanonicalOverlapResult | null>> {
  if (ids.length === 0)
    return {} as Record<PodcastIndexEpisodeId, CanonicalOverlapResult | null>;

  const merged = {} as Record<
    PodcastIndexEpisodeId,
    CanonicalOverlapResult | null
  >;

  for (let offset = 0; offset < ids.length; offset += MAX_OVERLAP_LOOKUP_IDS) {
    const chunk = ids.slice(offset, offset + MAX_OVERLAP_LOOKUP_IDS);
    const result = await getCanonicalTopicOverlaps(chunk);
    if (!result.success) continue;
    Object.assign(merged, result.data);
  }

  return merged;
}
