"use client";

import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Bookmark, ChevronRight, Rss, Star } from "lucide-react";
import type { Episode, Podcast, UserLibraryEntry } from "@/db/schema";

type LibraryItemWithRelations = UserLibraryEntry & {
  episode: Episode & {
    podcast: Podcast;
  };
};

interface SavedItemsProps {
  items: LibraryItemWithRelations[];
  isLoading?: boolean;
}

function formatDate(date: Date | null): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function SavedItems({ items, isLoading }: SavedItemsProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-semibold">Recently Saved</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-14 w-14 shrink-0 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-semibold">Recently Saved</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Bookmark className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              Your library is empty
            </p>
            <p className="text-xs text-muted-foreground">
              Save episodes to find them here
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
        <CardTitle className="text-lg font-semibold">Recently Saved</CardTitle>
        <Link
          href="/library"
          className="flex items-center text-sm text-muted-foreground hover:text-primary"
        >
          View all
          <ChevronRight className="ml-1 h-4 w-4" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/episode/${item.episode.podcastIndexId}`}
            className="flex gap-3 rounded-lg p-2 transition-colors hover:bg-accent"
          >
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
              {item.episode.podcast.imageUrl ? (
                <Image
                  src={item.episode.podcast.imageUrl}
                  alt={item.episode.podcast.title}
                  fill
                  className="object-cover"
                  sizes="56px"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Rss className="h-6 w-6" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="line-clamp-1 text-sm font-medium">
                {item.episode.title}
              </h4>
              <p className="line-clamp-1 text-xs text-muted-foreground">
                {item.episode.podcast.title}
              </p>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Saved {formatDate(item.savedAt)}</span>
                {item.rating && (
                  <span className="flex items-center gap-0.5 text-yellow-500">
                    <Star className="h-3 w-3 fill-current" />
                    {item.rating}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
