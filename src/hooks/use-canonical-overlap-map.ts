"use client";

import { useEffect, useRef, useState } from "react";
import { fetchCanonicalOverlapsBatched } from "@/lib/canonical-overlap-batching";
import { LISTEN_STATE_CHANGED_EVENT } from "@/lib/events";
import type { CanonicalOverlapResult } from "@/lib/topic-overlap";
import type { PodcastIndexEpisodeId } from "@/types/ids";

export type CanonicalOverlapMap = Record<
  PodcastIndexEpisodeId,
  CanonicalOverlapResult | null
>;

export function useCanonicalOverlapMap(
  ids: PodcastIndexEpisodeId[],
  options: { enabled?: boolean } = {},
): CanonicalOverlapMap {
  const { enabled = true } = options;
  const [map, setMap] = useState<CanonicalOverlapMap>({});
  const idsKey = JSON.stringify(ids);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!enabled || ids.length === 0) {
      setMap({});
      return;
    }
    let ignore = false;

    const fetchOverlaps = () => {
      const seq = ++seqRef.current;
      fetchCanonicalOverlapsBatched(ids)
        .then((result) => {
          if (!ignore && seq === seqRef.current) setMap(result);
        })
        .catch((err) => {
          console.warn("[canonical-overlap] batched fetch threw", err);
          if (!ignore && seq === seqRef.current) setMap({});
        });
    };

    fetchOverlaps();
    // Canonical overlap counts depend on listen history; refresh when any
    // ListenedButton fires so stale "You've heard N episodes on X" labels
    // don't outlive the underlying state.
    window.addEventListener(LISTEN_STATE_CHANGED_EVENT, fetchOverlaps);
    return () => {
      ignore = true;
      window.removeEventListener(LISTEN_STATE_CHANGED_EVENT, fetchOverlaps);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ids stable via idsKey join
  }, [enabled, idsKey]);

  return map;
}
