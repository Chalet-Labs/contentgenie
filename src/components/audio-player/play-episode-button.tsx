"use client";

import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useAudioPlayerAPI,
  useAudioPlayerState,
  type AudioEpisode,
} from "@/contexts/audio-player-context";

interface PlayEpisodeButtonProps {
  episode: AudioEpisode;
  /**
   * Runs synchronously before `playEpisode` — used by notifications to flip
   * the row to read via `markReadOptimistic` so navigation-free playback still
   * clears unread state.
   */
  onBeforePlay?: () => void;
  "aria-label"?: string;
}

export function PlayEpisodeButton({
  episode,
  onBeforePlay,
  "aria-label": ariaLabelProp,
}: PlayEpisodeButtonProps) {
  const { playEpisode } = useAudioPlayerAPI();
  const { currentEpisode } = useAudioPlayerState();

  const isNowPlaying = currentEpisode?.id === episode.id;
  const label = ariaLabelProp ?? (isNowPlaying ? "Now playing" : "Play episode");

  function handleClick() {
    if (isNowPlaying) return;
    onBeforePlay?.();
    playEpisode(episode);
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      disabled={isNowPlaying}
      aria-label={label}
      title={label}
      className="h-8 w-8 shrink-0"
    >
      <Play className="h-4 w-4" />
    </Button>
  );
}
