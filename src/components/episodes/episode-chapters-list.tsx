"use client";

import { BookMarked } from "lucide-react";
import { type Chapter } from "@/lib/chapters";
import { formatTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAudioPlayerAPI,
  useAudioPlayerProgress,
  useAudioPlayerState,
  type AudioEpisode,
} from "@/contexts/audio-player-context";
import { findChapterIndexAtTime } from "@/hooks/use-current-chapter";
import type { UseChaptersState } from "@/hooks/use-chapters";

interface EpisodeChaptersListProps {
  state: UseChaptersState;
  audioEpisode: AudioEpisode;
  /**
   * Whether this episode can be started/seeked from here. When false
   * (e.g. offline, missing enclosure URL), clicks on non-current-episode
   * rows are disabled so we never replace the player with an unplayable
   * source. Current-episode seek/resume is always allowed — that audio is
   * already loaded.
   */
  canPlay?: boolean;
}

export function EpisodeChaptersList({
  state,
  audioEpisode,
  canPlay = true,
}: EpisodeChaptersListProps) {
  const playerState = useAudioPlayerState();
  const progress = useAudioPlayerProgress();
  const playerAPI = useAudioPlayerAPI();

  switch (state.status) {
    case "idle":
    case "loading":
      return (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      );

    case "error":
      return (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load chapters. {state.message}
        </p>
      );

    case "ready": {
      const { chapters } = state;
      if (chapters.length === 0) {
        return (
          <p className="text-sm text-muted-foreground">
            No chapters available for this episode.
          </p>
        );
      }

      const isCurrentEpisode =
        playerState.currentEpisode?.id === audioEpisode.id;
      const activeIndex = isCurrentEpisode
        ? findChapterIndexAtTime(chapters, progress.currentTime)
        : -1;

      const handleSelect = (chapter: Chapter) => {
        if (isCurrentEpisode) {
          playerAPI.seek(chapter.startTime);
          if (!playerState.isPlaying) {
            playerAPI.togglePlay();
          }
        } else if (canPlay) {
          playerAPI.playEpisode(audioEpisode, { startAt: chapter.startTime });
        }
      };

      const rowDisabled = !isCurrentEpisode && !canPlay;

      return (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <BookMarked className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Chapters</h3>
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {chapters.map((chapter, index) => {
              const active = index === activeIndex;
              return (
                <li key={`${chapter.startTime}-${index}`}>
                  <button
                    type="button"
                    onClick={() => handleSelect(chapter)}
                    disabled={rowDisabled}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      "disabled:cursor-not-allowed disabled:opacity-60",
                      active
                        ? "bg-primary/[0.08] text-primary"
                        : "hover:bg-muted/60",
                    )}
                  >
                    <span
                      className={cn(
                        "w-14 shrink-0 text-xs font-medium tabular-nums",
                        active ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {formatTime(chapter.startTime)}
                    </span>
                    <span
                      className={cn(
                        "flex-1 text-sm",
                        active ? "font-medium text-primary" : "text-foreground",
                      )}
                    >
                      {chapter.title}
                    </span>
                    {active && (
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      );
    }
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}
