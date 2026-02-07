"use client";

import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, Sparkles, Rss } from "lucide-react";
import type { PodcastIndexPodcast } from "@/lib/podcastindex";

interface RecommendationsProps {
  podcasts: PodcastIndexPodcast[];
  isLoading?: boolean;
}

export function Recommendations({ podcasts, isLoading }: RecommendationsProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-semibold">Recommended for You</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-16 w-16 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (podcasts.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-semibold">Recommended for You</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Sparkles className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              No recommendations yet
            </p>
            <p className="text-xs text-muted-foreground">
              Subscribe to podcasts to get personalized suggestions
            </p>
            <Link
              href="/discover"
              className="mt-4 text-sm font-medium text-primary hover:underline"
            >
              Discover Podcasts
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold">Recommended for You</CardTitle>
        <Link
          href="/discover"
          className="flex items-center text-sm text-muted-foreground hover:text-primary"
        >
          Discover more
          <ChevronRight className="ml-1 h-4 w-4" />
        </Link>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {podcasts.map((podcast) => {
            const categories = podcast.categories
              ? Object.values(podcast.categories).slice(0, 2)
              : [];

            return (
              <Link
                key={podcast.id}
                href={`/podcast/${podcast.id}`}
                className="flex gap-3 rounded-lg p-2 transition-colors hover:bg-accent"
              >
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {podcast.artwork || podcast.image ? (
                    <Image
                      src={podcast.artwork || podcast.image}
                      alt={podcast.title}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <Rss className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="line-clamp-1 text-sm font-medium">
                    {podcast.title}
                  </h4>
                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {podcast.author || podcast.ownerName || "Unknown author"}
                  </p>
                  {categories.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {categories.map((cat, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
                          {cat}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
