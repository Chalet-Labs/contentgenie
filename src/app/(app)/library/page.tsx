"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Bookmark, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SavedEpisodeCard } from "@/components/library/saved-episode-card";
import { getUserLibrary } from "@/app/actions/library";
import type { Episode, Podcast, UserLibraryEntry } from "@/db/schema";

type LibraryItem = UserLibraryEntry & {
  episode: Episode & {
    podcast: Podcast;
  };
};

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLibrary = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const result = await getUserLibrary();

    if (result.error) {
      setError(result.error);
    } else {
      setItems(result.items as LibraryItem[]);
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const handleRemoved = () => {
    loadLibrary();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Library</h1>
          <p className="text-muted-foreground">
            {isLoading
              ? "Loading your saved episodes..."
              : items.length > 0
              ? `${items.length} saved episode${items.length === 1 ? "" : "s"}`
              : "Your saved episodes, collections, and notes."}
          </p>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex gap-4 rounded-lg border p-4">
              <Skeleton className="h-20 w-20 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {!isLoading && error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={loadLibrary}
            className="mt-4"
          >
            Try Again
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && items.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border bg-card p-12 text-center">
          <div className="mb-4 rounded-full bg-muted p-4">
            <Bookmark className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">Your library is empty</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Save episodes to build your collection. Browse podcasts and click the
            save button to add episodes here.
          </p>
          <Button asChild className="mt-6">
            <Link href="/discover">
              <Search className="mr-2 h-4 w-4" />
              Discover Podcasts
            </Link>
          </Button>
        </div>
      )}

      {/* Saved episodes list */}
      {!isLoading && !error && items.length > 0 && (
        <div className="space-y-4">
          {items.map((item) => (
            <SavedEpisodeCard
              key={item.id}
              item={item}
              onRemoved={handleRemoved}
            />
          ))}
        </div>
      )}
    </div>
  );
}
