"use client";

import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Rss, ChevronRight } from "lucide-react";
import type { RecentEpisode } from "@/app/actions/dashboard";

interface RecentEpisodesProps {
  episodes: RecentEpisode[];
  isLoading?: boolean;
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatDate(timestamp: number): string {
  if (!timestamp) return "";
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

export function RecentEpisodes({ episodes, isLoading }: RecentEpisodesProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-semibold">Recent from Subscriptions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-16 w-16 shrink-0 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (episodes.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-semibold">Recent from Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Rss className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              No recent episodes yet
            </p>
            <p className="text-xs text-muted-foreground">
              Subscribe to podcasts to see new episodes here
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
        <CardTitle className="text-lg font-semibold">Recent from Subscriptions</CardTitle>
        <Link
          href="/subscriptions"
          className="flex items-center text-sm text-muted-foreground hover:text-primary"
        >
          View all
          <ChevronRight className="ml-1 h-4 w-4" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {episodes.map((episode) => (
          <Link
            key={episode.id}
            href={`/episode/${episode.id}`}
            className="flex gap-3 rounded-lg p-2 transition-colors hover:bg-accent"
          >
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
              {episode.podcastImage || episode.feedImage ? (
                <Image
                  src={episode.podcastImage || episode.feedImage}
                  alt={episode.podcastTitle || episode.title}
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
              <h4 className="line-clamp-1 text-sm font-medium">{episode.title}</h4>
              <p className="line-clamp-1 text-xs text-muted-foreground">
                {episode.podcastTitle}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {episode.datePublished && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(episode.datePublished)}
                  </span>
                )}
                {episode.duration && episode.duration > 0 && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDuration(episode.duration)}
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
