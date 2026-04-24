"use client";

import { useState } from "react";
import { Rss, Check, Loader2, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useSyncQueue } from "@/hooks/use-sync-queue";
import { offlineSubscribe, offlineUnsubscribe } from "@/lib/offline-actions";
import { useSidebarCountsOptional } from "@/contexts/sidebar-counts-context";

interface SubscribeButtonProps {
  podcastIndexId: string;
  title: string;
  description?: string;
  publisher?: string;
  imageUrl?: string;
  rssFeedUrl?: string;
  categories?: string[];
  totalEpisodes?: number;
  latestEpisodeDate?: number; // Unix timestamp
  initialSubscribed: boolean;
  size?: "default" | "sm" | "lg" | "icon";
}

export function SubscribeButton({
  podcastIndexId,
  title,
  description,
  publisher,
  imageUrl,
  rssFeedUrl,
  categories,
  totalEpisodes,
  latestEpisodeDate,
  initialSubscribed,
  size = "lg",
}: SubscribeButtonProps) {
  const [isSubscribed, setIsSubscribed] = useState(initialSubscribed);
  // useState for isLoading (useTransition not viable on React 18)
  const [isLoading, setIsLoading] = useState(false);
  const isOnline = useOnlineStatus();
  const { hasPending, hasFailed } = useSyncQueue();
  const { refreshCounts } = useSidebarCountsOptional();

  const entityKey = `podcast:${podcastIndexId}`;
  const isPendingSync = hasPending(entityKey);
  const isFailedSync = hasFailed(entityKey);

  const handleToggleSubscription = async () => {
    setIsLoading(true);
    try {
      if (isSubscribed) {
        const result = await offlineUnsubscribe(podcastIndexId, isOnline);
        if (result.success) {
          setIsSubscribed(false);
          if (!result.queued) refreshCounts();
          toast.success(
            result.queued
              ? "Unsubscribed (will sync when online)"
              : "Unsubscribed",
            { description: `You've unsubscribed from ${title}` },
          );
        } else {
          toast.error("Failed to unsubscribe", {
            description: result.error || "Please try again",
          });
        }
      } else {
        const result = await offlineSubscribe(
          {
            podcastIndexId,
            title,
            description,
            publisher,
            imageUrl,
            rssFeedUrl,
            categories,
            totalEpisodes,
            latestEpisodeDate:
              latestEpisodeDate != null
                ? new Date(latestEpisodeDate * 1000)
                : undefined,
          },
          isOnline,
        );
        if (result.success) {
          setIsSubscribed(true);
          if (!result.queued) refreshCounts();
          toast.success(
            result.queued
              ? "Subscribed (will sync when online)"
              : "Subscribed!",
            { description: `You're now subscribed to ${title}` },
          );
        } else {
          toast.error("Failed to subscribe", {
            description: result.error || "Please try again",
          });
        }
      }
    } catch (error) {
      toast.error(
        isSubscribed ? "Failed to unsubscribe" : "Failed to subscribe",
        {
          description:
            error instanceof Error ? error.message : "Please try again",
        },
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubscribed) {
    return (
      <Button
        variant="outline"
        size={size}
        onClick={handleToggleSubscription}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Check className="mr-2 h-4 w-4" />
        )}
        Subscribed
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

  return (
    <Button size={size} onClick={handleToggleSubscription} disabled={isLoading}>
      {isLoading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Rss className="mr-2 h-4 w-4" />
      )}
      Subscribe
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
