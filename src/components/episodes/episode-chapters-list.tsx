"use client";

import { useMemo } from "react";
import { BookMarked } from "lucide-react";
import { type Chapter } from "@/lib/chapters";
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
}

function formatChapterTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function EpisodeChaptersList({
  state,
  audioEpisode,
}: EpisodeChaptersListProps) {
  const playerState = useAudioPlayerState();
  const progress = useAudioPlayerProgress();
  const playerAPI = useAudioPlayerAPI();

  const isCurrentEpisode = playerState.currentEpisode?.id === audioEpisode.id;

  const chapters = useMemo(
    () => (state.status === "ready" ? state.chapters : []),
    [state],
  );
  const activeIndex = useMemo(
    () =>
      isCurrentEpisode
        ? findChapterIndexAtTime(chapters, progress.currentTime)
        : -1,
    [isCurrentEpisode, progress.currentTime, chapters],
  );

  const handleSelect = (chapter: Chapter) => {
    if (isCurrentEpisode) {
      playerAPI.seek(chapter.startTime);
    } else {
      playerAPI.playEpisode(audioEpisode, { startAt: chapter.startTime });
    }
  };

  if (state.status === "loading" || state.status === "idle") {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <p className="text-sm text-muted-foreground">
        Couldn&apos;t load chapters. {state.message}
      </p>
    );
  }

  if (chapters.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No chapters available for this episode.
      </p>
    );
  }

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
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  active
                    ? "bg-primary/[0.08] text-primary"
                    : "hover:bg-muted/60",
                )}
              >
                <span
                  className={cn(
                    "w-12 shrink-0 text-xs font-medium tabular-nums",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {formatChapterTime(chapter.startTime)}
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
