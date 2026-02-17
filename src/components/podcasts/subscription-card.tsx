"use client";

import Image from "next/image";
import Link from "next/link";
import { Rss, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubscribeButton } from "./subscribe-button";
import type { Podcast } from "@/db/schema";

interface SubscriptionCardProps {
  podcast: Omit<Podcast, "description"> & { description?: string | null };
  subscribedAt: Date;
}

export function SubscriptionCard({
  podcast,
  subscribedAt,
}: SubscriptionCardProps) {
  const categories = podcast.categories || [];

  return (
    <Link href={`/podcast/${podcast.podcastIndexId}?from=subscriptions`}>
      <Card className="group overflow-hidden transition-colors hover:bg-accent">
        <CardContent className="p-0">
          <div className="flex gap-4 p-4">
            {/* Podcast artwork */}
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
              {podcast.imageUrl ? (
                <Image
                  src={podcast.imageUrl}
                  alt={podcast.title}
                  fill
                  className="object-cover"
                  sizes="96px"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Rss className="h-8 w-8" />
                </div>
              )}
            </div>

            {/* Podcast info */}
            <div className="flex flex-1 flex-col gap-2">
              <div>
                <h3 className="font-semibold group-hover:text-primary">
                  {podcast.title}
                </h3>
                {podcast.publisher && (
                  <p className="text-sm text-muted-foreground">
                    {podcast.publisher}
                  </p>
                )}
              </div>

              {/* Categories */}
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {categories.slice(0, 3).map((category, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {category}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Stats */}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {podcast.totalEpisodes && podcast.totalEpisodes > 0 && (
                  <span>{podcast.totalEpisodes} episodes</span>
                )}
                {podcast.latestEpisodeDate && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Latest:{" "}
                    {new Date(podcast.latestEpisodeDate).toLocaleDateString(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }
                    )}
                  </span>
                )}
              </div>
            </div>

            {/* Actions — click isolated */}
            <div
              className="relative z-10 flex shrink-0 flex-col items-end justify-between"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.stopPropagation();
              }}
            >
              <SubscribeButton
                podcastIndexId={podcast.podcastIndexId}
                title={podcast.title}
                description={podcast.description || undefined}
                publisher={podcast.publisher || undefined}
                imageUrl={podcast.imageUrl || undefined}
                rssFeedUrl={podcast.rssFeedUrl || undefined}
                categories={categories}
                totalEpisodes={podcast.totalEpisodes || undefined}
                latestEpisodeDate={
                  podcast.latestEpisodeDate
                    ? Math.floor(
                        new Date(podcast.latestEpisodeDate).getTime() / 1000
                      )
                    : undefined
                }
                initialSubscribed={true}
                size="sm"
              />
              <span className="text-xs text-muted-foreground">
                Subscribed{" "}
                {new Date(subscribedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
