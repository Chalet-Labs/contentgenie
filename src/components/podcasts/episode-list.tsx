"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { EpisodeCard } from "./episode-card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { PodcastIndexEpisode } from "@/lib/podcastindex";
import type { SummaryStatus } from "@/db/schema";

interface EpisodeListProps {
  episodes: PodcastIndexEpisode[];
  isLoading?: boolean;
  error?: string | null;
  statusMap?: Record<string, SummaryStatus>;
  scoreMap?: Record<string, string>;
}

export function EpisodeList({ episodes, isLoading, error, statusMap, scoreMap }: EpisodeListProps) {
  const [query, setQuery] = useState("");

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

  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();
  const filteredEpisodes = normalizedQuery
    ? episodes.filter((episode) =>
        (episode.title ?? "").toLowerCase().includes(normalizedQuery),
      )
    : episodes;

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
        filteredEpisodes.map((episode) => (
          <EpisodeCard
            key={episode.id}
            episode={episode}
            summaryStatus={statusMap?.[String(episode.id)]}
            worthItScore={scoreMap?.[String(episode.id)]}
          />
        ))
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
