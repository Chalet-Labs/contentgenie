"use client";

import { useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Loader2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useSyncQueue } from "@/hooks/use-sync-queue";
import {
  offlineSaveEpisode,
  offlineUnsaveEpisode,
} from "@/lib/offline-actions";
import { useSidebarCountsOptional } from "@/contexts/sidebar-counts-context";

interface EpisodeData {
  podcastIndexId: string;
  title: string;
  description?: string;
  audioUrl?: string;
  duration?: number;
  publishDate?: Date;
  podcast: {
    podcastIndexId: string;
    title: string;
    description?: string;
    publisher?: string;
    imageUrl?: string;
    rssFeedUrl?: string;
    categories?: string[];
    totalEpisodes?: number;
  };
}

interface SaveButtonProps {
  episodeData: EpisodeData;
  initialSaved?: boolean;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "secondary" | "ghost";
}

export function SaveButton({
  episodeData,
  initialSaved = false,
  size = "default",
  variant = "outline",
}: SaveButtonProps) {
  const [isSaved, setIsSaved] = useState(initialSaved);
  const [isLoading, setIsLoading] = useState(false);
  const isOnline = useOnlineStatus();
  // useState for isLoading (useTransition not viable on React 18)
  const { hasPending, hasFailed } = useSyncQueue();
  const { refreshCounts } = useSidebarCountsOptional();

  const entityKey = `episode:${episodeData.podcastIndexId}`;
  const isPendingSync = hasPending(entityKey);
  const isFailedSync = hasFailed(entityKey);

  const handleToggle = async () => {
    setIsLoading(true);
    try {
      if (isSaved) {
        const result = await offlineUnsaveEpisode(
          episodeData.podcastIndexId,
          isOnline,
        );
        if (result.success) {
          setIsSaved(false);
          if (!result.queued) refreshCounts();
          toast.success(
            result.queued
              ? "Removed (will sync when online)"
              : "Removed from library",
            { description: `"${episodeData.title}" has been removed` },
          );
        } else {
          toast.error("Failed to remove", {
            description: result.error || "Please try again",
          });
        }
      } else {
        const result = await offlineSaveEpisode(episodeData, isOnline);
        if (result.success) {
          setIsSaved(true);
          if (!result.queued) refreshCounts();
          toast.success(
            result.queued
              ? "Saved (will sync when online)"
              : "Saved to library!",
            { description: `"${episodeData.title}" has been saved` },
          );
        } else {
          toast.error("Failed to save", {
            description: result.error || "Please try again",
          });
        }
      }
    } catch (error) {
      toast.error(isSaved ? "Failed to remove" : "Failed to save", {
        description:
          error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={isSaved ? "secondary" : variant}
      size={size}
      onClick={handleToggle}
      disabled={isLoading}
    >
      {isLoading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : isSaved ? (
        <BookmarkCheck className="mr-2 h-4 w-4" />
      ) : (
        <Bookmark className="mr-2 h-4 w-4" />
      )}
      {isSaved ? "Saved" : "Save"}
      {isFailedSync ? (
        <>
          <span className="sr-only">Sync failed</span>
          <AlertCircle
            aria-hidden="true"
            className="ml-1 h-3 w-3 text-destructive"
          />
        </>
      ) : isPendingSync ? (
        <Clock className="ml-1 h-3 w-3 text-muted-foreground" />
      ) : null}
    </Button>
  );
}
