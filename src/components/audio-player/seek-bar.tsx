"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Slider } from "@/components/ui/slider"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAudioPlayerProgress, useAudioPlayerAPI, useAudioPlayerState } from "@/contexts/audio-player-context"
import { formatTime } from "@/lib/format-time"
import { getLibraryEntryByEpisodeId, getBookmarks } from "@/app/actions/library"
import type { Bookmark } from "@/db/schema"

export function SeekBar() {
  const { currentTime, buffered } = useAudioPlayerProgress()
  const { duration, chapters, currentEpisode } = useAudioPlayerState()
  const { seek } = useAudioPlayerAPI()
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])

  const handleSeek = useCallback(
    (value: number[]) => {
      seek(value[0])
    },
    [seek]
  )

  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0

  const chapterTicks = useMemo(() => {
    if (!chapters || duration <= 0) return null
    return chapters
      .filter((ch) => ch.startTime > 0 && ch.startTime < duration)
      .map((ch) => ({ startTime: ch.startTime, title: ch.title, left: (ch.startTime / duration) * 100 }))
  }, [chapters, duration])

  // Fetch bookmarks for the current episode and refetch on changes
  useEffect(() => {
    if (!currentEpisode) {
      setBookmarks([])
      return
    }

    let cancelled = false

    const fetchAndSetBookmarks = async () => {
      const entry = await getLibraryEntryByEpisodeId(currentEpisode.id)
      if (cancelled || !entry) {
        if (!cancelled) setBookmarks([])
        return
      }
      const result = await getBookmarks(entry.libraryEntryId)
      if (!cancelled) {
        setBookmarks(result.bookmarks ?? [])
      }
    }

    fetchAndSetBookmarks()

    window.addEventListener("bookmark-changed", fetchAndSetBookmarks)

    return () => {
      cancelled = true
      window.removeEventListener("bookmark-changed", fetchAndSetBookmarks)
    }
  }, [currentEpisode?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const bookmarkDots = useMemo(() => {
    if (bookmarks.length === 0 || duration <= 0) return null
    return bookmarks.map((bm) => ({
      id: bm.id,
      timestamp: bm.timestamp,
      note: bm.note,
      left: (bm.timestamp / duration) * 100,
    }))
  }, [bookmarks, duration])

  return (
    <div className="flex w-full items-center gap-2">
      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
        {formatTime(currentTime)}
      </span>
      <div className="relative flex-1">
        {/* Buffered range background */}
        <div className="pointer-events-none absolute inset-0 flex items-center">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/20">
            <div
              className="h-full bg-primary/40 transition-all"
              style={{ width: `${bufferedPercent}%` }}
            />
          </div>
        </div>
        {/* Chapter boundary markers */}
        {chapterTicks && (
          <div className="pointer-events-none absolute inset-0 flex items-center">
            {chapterTicks.map((tick) => (
              <div
                key={tick.startTime}
                className="absolute h-2.5 w-0.5 rounded-full bg-foreground/40"
                style={{ left: `${tick.left}%` }}
                title={tick.title}
                data-testid="chapter-tick"
              />
            ))}
          </div>
        )}
        {/* Bookmark dot indicators */}
        {bookmarkDots && (
          <TooltipProvider delayDuration={0}>
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center">
              {bookmarkDots.map((dot) => (
                <Tooltip key={dot.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="pointer-events-auto absolute h-2 w-2 rounded-full bg-primary/60 transition-transform hover:scale-150"
                      style={{ left: `${dot.left}%`, transform: `translateX(-50%)` }}
                      onClick={(e) => {
                        e.stopPropagation()
                        seek(dot.timestamp)
                      }}
                      aria-label={`Bookmark at ${formatTime(dot.timestamp)}`}
                      data-testid="bookmark-dot"
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {dot.note || `Bookmark at ${formatTime(dot.timestamp)}`}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        )}
        <Slider
          aria-label="Seek"
          min={0}
          max={duration || 100}
          step={1}
          value={[currentTime]}
          onValueChange={handleSeek}
        />
      </div>
      <span className="w-10 text-xs tabular-nums text-muted-foreground">
        {formatTime(duration)}
      </span>
    </div>
  )
}
