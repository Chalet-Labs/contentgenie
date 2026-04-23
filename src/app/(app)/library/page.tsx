"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { Bookmark, Search, ArrowUpDown, Star, Calendar, Clock, Type, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SavedEpisodeCard } from "@/components/library/saved-episode-card";
import { getUserLibrary, type LibrarySortOption, type SortDirection } from "@/app/actions/library";
import { getListenedEpisodeIds } from "@/app/actions/listen-history";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { cacheLibrary, getCachedLibrary } from "@/lib/offline-cache";
import type { SavedItemDTO } from "@/db/library-columns";

export default function LibraryPage() {
  const { userId } = useAuth();
  const isOnline = useOnlineStatus();

  const [items, setItems] = useState<SavedItemDTO[]>([]);
  const [listenedSet, setListenedSet] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<LibrarySortOption>("savedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [isFromCache, setIsFromCache] = useState(false);

  const loadLibrary = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const result = await getUserLibrary(sortBy, sortDirection);

    if (result.error) {
      setError(result.error);
    } else {
      const libraryItems = result.items;
      setItems(libraryItems);
      setIsFromCache(false);

      if (isOnline) {
        const s = await getListenedEpisodeIds(libraryItems.map((i) => i.episode.id))
        setListenedSet(s)
      }

      // Cache library data for offline use
      if (userId) {
        void cacheLibrary(userId, libraryItems);
      }
    }

    setIsLoading(false);
  }, [sortBy, sortDirection, userId, isOnline]);

  const loadFromCache = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setIsFromCache(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const cached = await getCachedLibrary(userId);
    if (cached) {
      setItems(cached);
      setIsFromCache(true);
    } else {
      setItems([]);
      setIsFromCache(true);
    }
    setListenedSet(new Set());

    setIsLoading(false);
  }, [userId]);

  // Load data: online fetches from server, offline from cache.
  // Also handles stale-while-revalidate on reconnection since
  // isOnline changing from false to true re-triggers this effect.
  useEffect(() => {
    if (isOnline) {
      loadLibrary();
    } else {
      loadFromCache();
    }
  }, [isOnline, loadLibrary, loadFromCache]);

  const handleRemoved = () => {
    loadLibrary();
  };

  const handleCollectionChanged = () => {
    loadLibrary();
  };

  const toggleSortDirection = () => {
    setSortDirection(prev => prev === "desc" ? "asc" : "desc");
  };

  return (
    <div className="space-y-6">
      <OfflineBanner isOffline={!isOnline} />

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

      {/* Sorting controls - only show when there are items and online */}
      {!isLoading && !error && items.length > 0 && isOnline && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort by:</span>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as LibrarySortOption)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="savedAt">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>Date Saved</span>
                </div>
              </SelectItem>
              <SelectItem value="rating">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  <span>Your Rating</span>
                </div>
              </SelectItem>
              <SelectItem value="publishDate">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>Publish Date</span>
                </div>
              </SelectItem>
              <SelectItem value="title">
                <div className="flex items-center gap-2">
                  <Type className="h-4 w-4" />
                  <span>Title</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={toggleSortDirection}
            className="shrink-0"
            title={sortDirection === "desc" ? "Sort descending" : "Sort ascending"}
          >
            <ArrowUpDown className={`h-4 w-4 transition-transform ${sortDirection === "asc" ? "rotate-180" : ""}`} />
          </Button>
        </div>
      )}

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

      {/* Empty state - offline with no cache */}
      {!isLoading && !error && items.length === 0 && !isOnline && isFromCache && (
        <div className="flex flex-col items-center justify-center rounded-lg border bg-card p-12 text-center">
          <div className="mb-4 rounded-full bg-muted p-4">
            <WifiOff className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">No cached data available</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Visit your library while online to enable offline access.
          </p>
        </div>
      )}

      {/* Empty state - online */}
      {!isLoading && !error && items.length === 0 && (isOnline || !isFromCache) && (
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
              onRemoved={isOnline ? handleRemoved : undefined}
              onCollectionChanged={isOnline ? handleCollectionChanged : undefined}
              isOffline={!isOnline}
              isListened={listenedSet.has(item.episode.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
