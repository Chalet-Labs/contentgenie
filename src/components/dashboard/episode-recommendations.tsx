"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Sparkles, Rss } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShowMoreToggle } from "@/components/ui/show-more-toggle";
import { WorthItBadge } from "@/components/episodes/worth-it-badge";
import { formatDate, formatDuration, stripHtml } from "@/lib/utils";
import { useExpandable } from "@/hooks/use-expandable";
import type { RecommendedEpisodeDTO } from "@/db/library-columns";
import { OverlapIndicator } from "@/components/episodes/overlap-indicator";

export const EPISODES_INITIAL = 3;

const RECOMMENDATIONS_LIST_ID = "episode-recommendations-list";

export function EpisodeRecommendationsLoading() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-48" />
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: EPISODES_INITIAL }).map((_, i) => (
            <div
              key={i}
              data-testid="episode-loading-row"
              className="flex gap-3 p-2"
            >
              <Skeleton className="h-14 w-14 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface EpisodeRecommendationsProps {
  episodes: RecommendedEpisodeDTO[];
}

export function EpisodeRecommendations({
  episodes,
}: EpisodeRecommendationsProps) {
  const { visible, expanded, hiddenCount, shouldShowToggle, toggle } =
    useExpandable(episodes, EPISODES_INITIAL);

  if (episodes.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-semibold">
            Recommended Episodes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-2 rounded-full bg-muted p-3">
              <Sparkles className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              No recommendations yet
            </p>
            <p className="text-xs text-muted-foreground">
              Check back as more episodes are rated by the community
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
        <CardTitle className="text-lg font-semibold">
          Recommended Episodes
        </CardTitle>
        <Link
          href="/discover"
          className="flex items-center text-sm text-muted-foreground hover:text-primary"
        >
          Discover more
          <ChevronRight className="ml-1 h-4 w-4" />
        </Link>
      </CardHeader>
      <CardContent>
        <div
          id={RECOMMENDATIONS_LIST_ID}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {visible.map((episode) => (
            <Link
              key={episode.id}
              href={`/episode/${episode.podcastIndexId}`}
              className="flex gap-3 rounded-lg p-2 transition-colors hover:bg-accent"
            >
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                {episode.podcastImageUrl ? (
                  <Image
                    src={episode.podcastImageUrl}
                    alt={episode.podcastTitle}
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
                  {episode.title}
                </h4>
                <p className="line-clamp-1 text-xs text-muted-foreground">
                  {episode.podcastTitle}
                </p>
                {episode.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {stripHtml(episode.description)}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <WorthItBadge
                    score={
                      episode.worthItScore != null
                        ? Number(episode.worthItScore)
                        : null
                    }
                  />
                  <span className="text-xs text-muted-foreground">
                    {formatDuration(episode.duration)}
                    {episode.publishDate && (
                      <> &middot; {formatDate(episode.publishDate)}</>
                    )}
                  </span>
                </div>
                <OverlapIndicator
                  canonical={episode.canonicalOverlap}
                  categoryLabel={episode.overlapLabel}
                  categoryLabelKind={episode.overlapLabelKind}
                  className="mt-1"
                />
              </div>
            </Link>
          ))}
        </div>
        {shouldShowToggle && (
          <ShowMoreToggle
            expanded={expanded}
            hiddenCount={hiddenCount}
            onToggle={toggle}
            ariaControls={RECOMMENDATIONS_LIST_ID}
          />
        )}
      </CardContent>
    </Card>
  );
}
