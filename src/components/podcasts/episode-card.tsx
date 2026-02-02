"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Calendar, Mic } from "lucide-react";
import type { PodcastIndexEpisode } from "@/lib/podcastindex";
import { formatDuration, formatPublishDate } from "@/lib/podcastindex";

interface EpisodeCardProps {
  episode: PodcastIndexEpisode;
}

export function EpisodeCard({ episode }: EpisodeCardProps) {
  return (
    <Link href={`/episode/${episode.id}`}>
      <Card className="group transition-colors hover:bg-accent">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 font-semibold group-hover:text-primary">
                  {episode.title}
                </h3>
              </div>
              {episode.episodeType && episode.episodeType !== "full" && (
                <Badge variant="secondary" className="shrink-0 text-xs">
                  {episode.episodeType}
                </Badge>
              )}
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
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}
