"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { EpisodeCard } from "./episode-card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { PodcastIndexEpisode } from "@/lib/podcastindex";
import type { SummaryStatus } from "@/db/schema";
import {
  asPodcastIndexEpisodeId,
  type PodcastIndexEpisodeId,
} from "@/types/ids";

interface EpisodeListProps {
  episodes: PodcastIndexEpisode[];
  isLoading?: boolean;
  error?: string | null;
  statusMap?: Record<string, SummaryStatus>;
  scoreMap?: Record<string, string>;
  // String arrays (not Set) because props cross the RSC Flight boundary from
  // Server Components to this Client Component; Set is not serializable on
  // Next.js 14 / React 18 and becomes {} on the client.
  listenedIds?: PodcastIndexEpisodeId[];
  // Podcast-index-episode-ids (stringified) that exist in our DB and can be targeted by recordListenEvent.
  // Omit to allow marking on all episodes (library/trending surfaces where every episode is in-DB by construction).
  knownIds?: PodcastIndexEpisodeId[];
  /**
   * Top topics per episode, keyed by PodcastIndex id. Absent keys render no
   * chips — episodes without summaries simply show nothing here.
   */
  topicsByPodcastIndexId?: Record<PodcastIndexEpisodeId, string[]>;
}

export function EpisodeList({
  episodes,
  isLoading,
  error,
  statusMap,
  scoreMap,
  listenedIds,
  knownIds,
  topicsByPodcastIndexId,
}: EpisodeListProps) {
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();
  const filteredEpisodes = useMemo(() => {
    if (!normalizedQuery) return episodes;
    return episodes.filter((episode) =>
      (episode.title ?? "").toLowerCase().includes(normalizedQuery),
    );
  }, [episodes, normalizedQuery]);
  const listenedSet = useMemo(() => new Set(listenedIds ?? []), [listenedIds]);
  const knownSet = useMemo(
    () => (knownIds ? new Set(knownIds) : undefined),
    [knownIds],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <EpisodeCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (episodes.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No episodes found for this podcast.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search episodes by title…"
          aria-label="Search episodes by title"
          className="pl-9"
        />
      </div>

      {normalizedQuery && filteredEpisodes.length === 0 ? (
        <div className="rounded-lg border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No episodes match &quot;{trimmedQuery}&quot;
          </p>
        </div>
      ) : (
        filteredEpisodes.map((episode) => {
          // PodcastIndex API id (number|string) → branded string.
          const piId = asPodcastIndexEpisodeId(String(episode.id));
          return (
            <EpisodeCard
              key={episode.id}
              episode={episode}
              summaryStatus={statusMap?.[piId]}
              worthItScore={scoreMap?.[piId]}
              isListened={listenedSet.has(piId)}
              canMarkListened={knownSet ? knownSet.has(piId) : true}
              topics={topicsByPodcastIndexId?.[piId]}
            />
          );
        })
      )}
    </div>
  );
}

function EpisodeCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="flex gap-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </div>
  );
}
