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
   * Runs synchronously before the player starts or resumes. Use for optimistic
   * state updates that must land before playback kicks off (e.g. flipping a
   * notification to read). Skipped when the episode is already playing.
   */
  onBeforePlay?: () => void;
  "aria-label"?: string;
}

export function PlayEpisodeButton({
  episode,
  onBeforePlay,
  "aria-label": ariaLabelProp,
}: PlayEpisodeButtonProps) {
  const { playEpisode, togglePlay } = useAudioPlayerAPI();
  const { currentEpisode, isPlaying } = useAudioPlayerState();

  const isCurrent = currentEpisode?.id === episode.id;
  const isActivelyPlaying = isCurrent && isPlaying;
  const label =
    ariaLabelProp ??
    (isActivelyPlaying
      ? "Now playing"
      : isCurrent
        ? "Resume episode"
        : "Play episode");

  function handleClick() {
    if (isActivelyPlaying) return;
    onBeforePlay?.();
    if (isCurrent) {
      togglePlay();
    } else {
      playEpisode(episode);
    }
  }

  // aria-disabled (not the native `disabled` attribute) keeps the button in the
  // tab order so screen-reader users can reach the "Now playing" state;
  // handleClick's early-return is what actually blocks the action.
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      aria-disabled={isActivelyPlaying}
      aria-label={label}
      title={label}
      className="h-8 w-8 shrink-0 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
    >
      <Play className="h-4 w-4" />
    </Button>
  );
}
