"use client";

import Link from "next/link";
import { TrendingUp, ChevronRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShowMoreToggle } from "@/components/ui/show-more-toggle";
import { cn, formatRelativeTime } from "@/lib/utils";
import { dedupeTopics } from "@/lib/trending";
import { useExpandable } from "@/hooks/use-expandable";
import type { TrendingTopic } from "@/db/schema";

export const TOPICS_INITIAL = 3;

interface TrendingTopicsProps {
  topics: TrendingTopic[];
  generatedAt: Date;
  // When true, the snapshot is older than STALE_THRESHOLD_MS; surfaced in the
  // header instead of hiding the card, so a missed cron doesn't look identical
  // to a deliberately disabled feature.
  isStale?: boolean;
}

export function TrendingTopics({ topics, generatedAt, isStale = false }: TrendingTopicsProps) {
  const updatedAgo = formatRelativeTime(generatedAt);
  const deduped = dedupeTopics(topics);
  const { visible, expanded, hiddenCount, shouldShowToggle, toggle } = useExpandable(
    deduped,
    TOPICS_INITIAL,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4" />
          Trending Topics
        </CardTitle>
        <CardDescription
          className={cn(isStale && "text-status-warning-text")}
        >
          Past 7 days · Updated {updatedAgo}
          {isStale && " · Out of date"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {deduped.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No trending topics yet — check back soon.
          </p>
        ) : (
          <>
            {visible.map(({ topic, slug }) => {
              const count = topic.episodeCount;
              return (
                <Link
                  key={slug}
                  href={`/trending/${slug}`}
                  className="flex items-start gap-3 rounded-md p-3 transition-colors hover:bg-accent"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold">{topic.name}</p>
                    {topic.description && (
                      <p className="line-clamp-2 break-words text-sm text-muted-foreground">
                        {topic.description}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                    <span>{count} {count === 1 ? "episode" : "episodes"}</span>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </Link>
              );
            })}
            {shouldShowToggle && (
              <ShowMoreToggle
                expanded={expanded}
                hiddenCount={hiddenCount}
                onToggle={toggle}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function TrendingTopicsLoading() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-56" />
      </CardHeader>
      <CardContent className="space-y-1">
        {Array.from({ length: TOPICS_INITIAL }).map((_, i) => (
          <div
            key={i}
            data-testid="trending-loading-row"
            className="flex items-start gap-3 p-3"
          >
            <div className="min-w-0 flex-1">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="mt-1.5 h-4 w-full" />
              <Skeleton className="mt-1 h-4 w-5/6" />
            </div>
            <Skeleton className="h-5 w-20 shrink-0" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
