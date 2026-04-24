"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { BookMarked, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format-time";
import {
  useAudioPlayerState,
  useAudioPlayerAPI,
} from "@/contexts/audio-player-context";
import { useCurrentChapter } from "@/hooks/use-current-chapter";
import { Button } from "@/components/ui/button";

export function ChapterList() {
  const { chapters } = useAudioPlayerState();
  const { seek } = useAudioPlayerAPI();
  const { chapter: currentChapter } = useCurrentChapter();
  const activeRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll to active chapter
  useEffect(() => {
    if (
      activeRef.current &&
      typeof activeRef.current.scrollIntoView === "function"
    ) {
      activeRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [currentChapter?.startTime]);

  if (!chapters || chapters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="mb-3 rounded-full bg-muted p-3">
          <BookMarked className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">No chapters</p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          This episode doesn&apos;t have chapter markers
        </p>
      </div>
    );
  }

  return (
    <div className="max-h-[50vh] overflow-y-auto">
      {chapters.map((chapter, index) => {
        const isActive = currentChapter === chapter;

        return (
          <Button
            key={`${chapter.startTime}-${index}`}
            ref={isActive ? activeRef : undefined}
            type="button"
            variant="ghost"
            onClick={() => seek(chapter.startTime)}
            className={cn(
              "flex h-auto w-full items-center justify-start gap-3 rounded-md px-2 py-2 text-left transition-colors [&_svg]:size-auto",
              isActive && "bg-primary/10",
            )}
          >
            {chapter.img ? (
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded bg-muted">
                <Image
                  src={chapter.img}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="32px"
                />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{chapter.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatTime(chapter.startTime)}
              </p>
            </div>
            {isActive && (
              <Volume2 className="h-3.5 w-3.5 shrink-0 text-primary" />
            )}
          </Button>
        );
      })}
    </div>
  );
}
