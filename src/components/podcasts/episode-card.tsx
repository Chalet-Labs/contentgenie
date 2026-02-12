"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Calendar, Mic, Star } from "lucide-react";
import type { PodcastIndexEpisode } from "@/lib/podcastindex";
import { formatDuration, formatPublishDate } from "@/lib/podcastindex";
import { ProcessingStatus } from "@/components/episodes/processing-status";
import { cn, stripHtml } from "@/lib/utils";
import type { SummaryStatus } from "@/db/schema";

interface EpisodeCardProps {
  episode: PodcastIndexEpisode;
  summaryStatus?: SummaryStatus | null;
  worthItScore?: string | null;
}

function getScoreColor(score: number): string {
  if (score >= 8) return "text-green-600 dark:text-green-400";
  if (score >= 5) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function ScoreIndicator({ value }: { value: string }) {
  const score = parseFloat(value);
  if (isNaN(score)) return null;
  return (
    <div className={cn("flex items-center gap-1", getScoreColor(score))}>
      <Star className="h-3 w-3" />
      <span>{score.toFixed(1)}</span>
    </div>
  );
}

export function EpisodeCard({ episode, summaryStatus, worthItScore }: EpisodeCardProps) {
  return (
    <Link href={`/episode/${episode.id}`}>
      <Card className={cn("group transition-colors hover:bg-accent", summaryStatus === "completed" && "border-l-2 border-primary")}>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 font-semibold group-hover:text-primary">
                  {episode.title}
                </h3>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {episode.episodeType && episode.episodeType !== "full" && (
                  <Badge variant="secondary" className="text-xs">
                    {episode.episodeType}
                  </Badge>
                )}
                <ProcessingStatus status={summaryStatus ?? null} className="text-xs" />
              </div>
            </div>

            <p className="line-clamp-2 text-sm text-muted-foreground">
              {episode.description
                ? stripHtml(episode.description)
                : "No description available"}
            </p>

            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{formatPublishDate(episode.datePublished)}</span>
              </div>
              {episode.duration > 0 && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{formatDuration(episode.duration)}</span>
                </div>
              )}
              {episode.episode !== null && (
                <div className="flex items-center gap-1">
                  <Mic className="h-3 w-3" />
                  <span>Episode {episode.episode}</span>
                </div>
              )}
              {episode.season > 0 && (
                <span>Season {episode.season}</span>
              )}
              {worthItScore != null && <ScoreIndicator value={worthItScore} />}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

