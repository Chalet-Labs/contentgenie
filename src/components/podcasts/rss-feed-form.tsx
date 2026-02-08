"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Rss, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { addPodcastByRssUrl } from "@/app/actions/subscriptions";

interface RssFeedFormProps {
  className?: string;
}

export function RssFeedForm({ className }: RssFeedFormProps) {
  const [url, setUrl] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = url.trim();
    if (!trimmed) return;

    try {
      new URL(trimmed);
    } catch {
      toast.error("Please enter a valid URL starting with http:// or https://");
      return;
    }

    startTransition(async () => {
      const result = await addPodcastByRssUrl(trimmed);

      if (result.success) {
        const episodeMsg =
          result.episodeCount != null
            ? ` ${result.episodeCount} episodes imported.`
            : "";
        toast.success(`Subscribed to ${result.title ?? "podcast"}!${episodeMsg}`);
        setUrl("");
        if (result.podcastIndexId) {
          router.push(`/podcast/${result.podcastIndexId}`);
        }
      } else {
        toast.error(result.error ?? "Failed to add podcast");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Rss className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Paste RSS feed URL..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isPending}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline" disabled={isPending || !url.trim()}>
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Adding...
            </>
          ) : (
            "Add Feed"
          )}
        </Button>
      </div>
    </form>
  );
}
