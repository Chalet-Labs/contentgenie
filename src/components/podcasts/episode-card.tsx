"use client";

import { Calendar, Clock, Mic } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PodcastIndexEpisode } from "@/lib/podcastindex";
import { formatDuration, formatPublishDate } from "@/lib/podcastindex";
import { asPodcastIndexEpisodeId } from "@/types/ids";
import { stripHtml } from "@/lib/utils";
import type { SummaryStatus } from "@/db/schema";
import type { CanonicalTopicChip } from "@/db/library-columns";
import { AddToQueueButton } from "@/components/audio-player/add-to-queue-button";
import { PlayEpisodeButton } from "@/components/audio-player/play-episode-button";
import { ListenedButton } from "@/components/episodes/listened-button";
import { EpisodeCard as EpisodeCardPrimitive } from "@/components/episodes/episode-card";

interface EpisodeCardProps {
  episode: PodcastIndexEpisode;
  summaryStatus?: SummaryStatus | null;
  worthItScore?: string | null;
  showQueueAction?: boolean;
  isListened?: boolean;
  canMarkListened?: boolean;
  /** Top topics for this episode, rendered as chips under the title (primitive caps at 3). */
  topics?: string[];
  /** Canonical topic chips rendered below category badges (capped at 3 by primitive). */
  canonicalTopics?: CanonicalTopicChip[];
}

export function EpisodeCard({
  episode,
  summaryStatus,
  worthItScore,
  showQueueAction = true,
  isListened = false,
  canMarkListened = true,
  topics,
  canonicalTopics,
}: EpisodeCardProps) {
  // PodcastIndex API id (number|string) → branded string.
  const piId = asPodcastIndexEpisodeId(String(episode.id));

  const audioEpisode = episode.enclosureUrl
    ? {
        id: piId,
        title: episode.title,
        podcastTitle: episode.feedTitle ?? "Podcast",
        audioUrl: episode.enclosureUrl,
        ...(episode.feedImage ? { artwork: episode.feedImage } : {}),
        ...(episode.duration ? { duration: episode.duration } : {}),
        ...(episode.chaptersUrl ? { chaptersUrl: episode.chaptersUrl } : {}),
      }
    : null;

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
    ...(typeof episode.episode === "number" && episode.episode > 0
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

  const primaryAction = audioEpisode ? (
    <PlayEpisodeButton episode={audioEpisode} />
  ) : null;

  const secondaryActions = (
    <>
      {showQueueAction && audioEpisode && (
        <AddToQueueButton episode={audioEpisode} variant="icon" />
      )}
      {canMarkListened && (
        <ListenedButton podcastIndexEpisodeId={piId} isListened={isListened} />
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
      topics={topics}
      canonicalTopics={canonicalTopics}
      meta={meta}
      primaryAction={primaryAction}
      secondaryActions={secondaryActions}
      isListened={isListened}
    />
  );
}
