"use client";

import { EpisodeCard } from "./episode-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PodcastIndexEpisode } from "@/lib/podcastindex";

interface EpisodeListProps {
  episodes: PodcastIndexEpisode[];
  isLoading?: boolean;
  error?: string | null;
}

export function EpisodeList({ episodes, isLoading, error }: EpisodeListProps) {
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
      {episodes.map((episode) => (
        <EpisodeCard key={episode.id} episode={episode} />
      ))}
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
