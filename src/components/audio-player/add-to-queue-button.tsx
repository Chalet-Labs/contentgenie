"use client";

import { ListPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  useAudioPlayerAPI,
  useNowPlayingEpisodeId,
  useIsEpisodeInQueue,
  type AudioEpisode,
} from "@/contexts/audio-player-context";

interface AddToQueueButtonProps {
  episode: AudioEpisode;
  variant?: "icon" | "full";
}

export function AddToQueueButton({
  episode,
  variant = "full",
}: AddToQueueButtonProps) {
  const { addToQueue } = useAudioPlayerAPI();
  const nowPlayingId = useNowPlayingEpisodeId();
  const isInQueue = useIsEpisodeInQueue(episode.id);

  const isNowPlaying = nowPlayingId === episode.id;
  const isDisabled = isNowPlaying || isInQueue;

  function handleClick() {
    if (isDisabled) return;
    addToQueue(episode);
    if (nowPlayingId !== null) {
      toast.success(`Added to queue: ${episode.title}`);
    }
  }

  const label = isNowPlaying
    ? "Now playing"
    : isInQueue
      ? "Already in queue"
      : "Add to Queue";

  if (variant === "icon") {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleClick}
        disabled={isDisabled}
        aria-label={label}
        title={label}
        className="h-8 w-8 shrink-0"
      >
        <ListPlus className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isDisabled}
      aria-label={label}
    >
      <ListPlus className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}
