"use client";

import { useState, useTransition } from "react";
import { Rss, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  subscribeToPodcast,
  unsubscribeFromPodcast,
} from "@/app/actions/subscriptions";

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
  const [isPending, startTransition] = useTransition();

  const handleToggleSubscription = () => {
    startTransition(async () => {
      if (isSubscribed) {
        const result = await unsubscribeFromPodcast(podcastIndexId);
        if (result.success) {
          setIsSubscribed(false);
          toast.success("Unsubscribed", {
            description: `You've unsubscribed from ${title}`,
          });
        } else {
          toast.error("Failed to unsubscribe", {
            description: result.error || "Please try again",
          });
        }
      } else {
        const result = await subscribeToPodcast({
          podcastIndexId,
          title,
          description,
          publisher,
          imageUrl,
          rssFeedUrl,
          categories,
          totalEpisodes,
          latestEpisodeDate: latestEpisodeDate
            ? new Date(latestEpisodeDate * 1000)
            : undefined,
        });
        if (result.success) {
          setIsSubscribed(true);
          toast.success("Subscribed!", {
            description: `You're now subscribed to ${title}`,
          });
        } else {
          toast.error("Failed to subscribe", {
            description: result.error || "Please try again",
          });
        }
      }
    });
  };

  if (isSubscribed) {
    return (
      <Button
        variant="outline"
        size={size}
        onClick={handleToggleSubscription}
        disabled={isPending}
      >
        {isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Check className="mr-2 h-4 w-4" />
        )}
        Subscribed
      </Button>
    );
  }

  return (
    <Button size={size} onClick={handleToggleSubscription} disabled={isPending}>
      {isPending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Rss className="mr-2 h-4 w-4" />
      )}
      Subscribe
    </Button>
  );
}
