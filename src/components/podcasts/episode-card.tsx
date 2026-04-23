"use client";

import { Calendar, Clock, Mic } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PodcastIndexEpisode } from "@/lib/podcastindex";
import { formatDuration, formatPublishDate } from "@/lib/podcastindex";
import { stripHtml } from "@/lib/utils";
import type { SummaryStatus } from "@/db/schema";
import { AddToQueueButton } from "@/components/audio-player/add-to-queue-button";
import { ListenedButton } from "@/components/episodes/listened-button";
import { EpisodeCard as EpisodeCardPrimitive } from "@/components/episodes/episode-card";

interface EpisodeCardProps {
  episode: PodcastIndexEpisode;
  summaryStatus?: SummaryStatus | null;
  worthItScore?: string | null;
  showQueueAction?: boolean;
  isListened?: boolean;
  canMarkListened?: boolean;
}

export function EpisodeCard({
  episode,
  summaryStatus,
  worthItScore,
  showQueueAction = false,
  isListened = false,
  canMarkListened = true,
}: EpisodeCardProps) {
  const hasAudio = Boolean(episode.enclosureUrl);

  const meta = [
    <div key="date" className="flex items-center gap-1">
      <Calendar className="h-3 w-3" />
      <span>{formatPublishDate(episode.datePublished)}</span>
    </div>,
    ...(episode.duration > 0
      ? [
          <div key="duration" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{formatDuration(episode.duration)}</span>
          </div>,
        ]
      : []),
    ...(episode.episode !== null
      ? [
          <div key="episode" className="flex items-center gap-1">
            <Mic className="h-3 w-3" />
            <span>Episode {episode.episode}</span>
          </div>,
        ]
      : []),
    ...(episode.season > 0
      ? [<span key="season">Season {episode.season}</span>]
      : []),
    ...(episode.episodeType && episode.episodeType !== "full"
      ? [
          <Badge key="type" variant="secondary" className="text-xs">
            {episode.episodeType}
          </Badge>,
        ]
      : []),
  ];

  const secondaryActions = (
    <>
      {canMarkListened && (
        <ListenedButton
          podcastIndexEpisodeId={String(episode.id)}
          isListened={isListened}
        />
      )}
      {showQueueAction && hasAudio && (
        <div className="invisible opacity-0 transition-all group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 max-md:visible max-md:opacity-100">
          <AddToQueueButton
            episode={{
              id: String(episode.id),
              title: episode.title,
              podcastTitle: episode.feedTitle ?? "Podcast",
              audioUrl: episode.enclosureUrl,
              duration: episode.duration,
            }}
            variant="icon"
          />
        </div>
      )}
    </>
  );

  return (
    <EpisodeCardPrimitive
      podcastTitle={episode.feedTitle ?? "Podcast"}
      title={episode.title}
      href={`/episode/${episode.id}`}
      description={
        episode.description
          ? stripHtml(episode.description)
          : "No description available"
      }
      score={worthItScore ?? undefined}
      status={summaryStatus}
      meta={meta}
      secondaryActions={secondaryActions}
      isListened={isListened}
    />
  );
}
