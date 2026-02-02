"use client";

import { PodcastCard } from "./podcast-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PodcastIndexPodcast } from "@/lib/podcastindex";

interface SearchResultsProps {
  podcasts: PodcastIndexPodcast[];
  isLoading: boolean;
  error: string | null;
  query: string;
}

export function SearchResults({
  podcasts,
  isLoading,
  error,
  query,
}: SearchResultsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <SearchResultSkeleton key={i} />
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

  if (query && podcasts.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No podcasts found for &quot;{query}&quot;. Try a different search term.
        </p>
      </div>
    );
  }

  if (!query) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Enter a search term to find podcasts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Found {podcasts.length} podcast{podcasts.length !== 1 ? "s" : ""} for &quot;{query}&quot;
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {podcasts.map((podcast) => (
          <PodcastCard key={podcast.id} podcast={podcast} />
        ))}
      </div>
    </div>
  );
}

function SearchResultSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex gap-4">
        <Skeleton className="h-24 w-24 rounded-lg" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}
