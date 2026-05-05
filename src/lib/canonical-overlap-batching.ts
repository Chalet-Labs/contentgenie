import { getCanonicalTopicOverlaps } from "@/app/actions/dashboard";
import { MAX_OVERLAP_LOOKUP_IDS } from "@/lib/canonical-overlap-config";
import type { CanonicalOverlapResult } from "@/lib/topic-overlap";
import type { PodcastIndexEpisodeId } from "@/types/ids";

/**
 * Splits the input into chunks of `MAX_OVERLAP_LOOKUP_IDS` and merges the
 * per-chunk results. The server action `getCanonicalTopicOverlaps` silently
 * truncates inputs above that cap, so client callers must chunk explicitly to
 * avoid losing the tail of any oversized request.
 */
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
    if (!result.success) {
      console.warn("[canonical-overlap] chunk fetch failed; skipping", {
        offset,
        chunkSize: chunk.length,
        totalIds: ids.length,
        error: result.error,
      });
      continue;
    }
    Object.assign(merged, result.data);
  }

  return merged;
}
