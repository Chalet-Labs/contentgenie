"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronsLeft,
  ChevronsRight,
  X,
  Loader2,
  Rss,
  ListMusic,
  BookMarked,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  useAudioPlayerState,
  useAudioPlayerAPI,
  useAudioPlayerProgress,
} from "@/contexts/audio-player-context"
import { SeekBar } from "@/components/audio-player/seek-bar"
import { PlaybackSpeed } from "@/components/audio-player/playback-speed"
import { VolumeControl } from "@/components/audio-player/volume-control"
import { QueuePanel } from "@/components/audio-player/queue-panel"
import { ChapterPanel } from "@/components/audio-player/chapter-panel"
import { SleepTimerMenu } from "@/components/audio-player/sleep-timer-menu"
import { BookmarkButton } from "@/components/audio-player/bookmark-button"
import { useCurrentChapter } from "@/hooks/use-current-chapter"
import { useMediaQuery } from "@/hooks/use-media-query"

const REWIND_SECONDS = 10
const FORWARD_SECONDS = 30
const PREV_CHAPTER_RESTART_THRESHOLD_SECONDS = 3
const SKIP_FLASH_DURATION_MS = 700

type SkipFlash = { direction: "back" | "fwd"; seconds: number; key: number }

export function PlayerBar() {
  const { currentEpisode, isPlaying, isBuffering, isVisible, queue, chapters, chaptersLoading } =
    useAudioPlayerState()
  const { togglePlay, skipBack, skipForward, seek, playNext, closePlayer } =
    useAudioPlayerAPI()
  const { currentTime } = useAudioPlayerProgress()
  const [queueOpen, setQueueOpen] = useState(false)
  const [chaptersOpen, setChaptersOpen] = useState(false)
  const [skipFlash, setSkipFlash] = useState<SkipFlash | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentChapter = useCurrentChapter()
  const isDesktop = useMediaQuery("(min-width: 768px)")

  const hasChapters = chapters != null && chapters.length > 0
  const canNavigateQueue = queue.length > 0
  const showNavButtons = hasChapters || canNavigateQueue || chaptersLoading

  const currentChapterIdx = useMemo(() => {
    if (!hasChapters) return -1
    let idx = -1
    for (let i = 0; i < chapters.length; i++) {
      if (currentTime >= chapters[i].startTime) idx = i
    }
    return idx
  }, [chapters, currentTime, hasChapters])

  const flashSkip = useCallback((direction: "back" | "fwd", seconds: number) => {
    setSkipFlash({ direction, seconds, key: Date.now() })
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setSkipFlash(null), SKIP_FLASH_DURATION_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
  }, [])

  const handleSkipBack = useCallback(() => {
    skipBack(REWIND_SECONDS)
    flashSkip("back", REWIND_SECONDS)
  }, [skipBack, flashSkip])

  const handleSkipForward = useCallback(() => {
    skipForward(FORWARD_SECONDS)
    flashSkip("fwd", FORWARD_SECONDS)
  }, [skipForward, flashSkip])

  const handlePrevNav = useCallback(() => {
    if (hasChapters && currentChapterIdx >= 0) {
      const current = chapters[currentChapterIdx]
      const elapsed = currentTime - current.startTime
      if (elapsed < PREV_CHAPTER_RESTART_THRESHOLD_SECONDS && currentChapterIdx > 0) {
        seek(chapters[currentChapterIdx - 1].startTime)
      } else {
        seek(current.startTime)
      }
    }
  }, [hasChapters, chapters, currentChapterIdx, currentTime, seek])

  const handleNextNav = useCallback(() => {
    if (hasChapters) {
      const nextIdx = currentChapterIdx + 1
      if (nextIdx < chapters.length) {
        seek(chapters[nextIdx].startTime)
        return
      }
    }
    if (canNavigateQueue) {
      playNext()
    }
  }, [hasChapters, chapters, currentChapterIdx, canNavigateQueue, seek, playNext])

  const willAdvanceChapter =
    hasChapters && currentChapterIdx + 1 < chapters.length
  const prevLabel = hasChapters ? "Previous chapter" : "Previous episode"
  const nextLabel = willAdvanceChapter ? "Next chapter" : "Next episode"
  const canGoPrev = hasChapters && currentChapterIdx >= 0
  const canGoNext = willAdvanceChapter || canNavigateQueue

  if (!isVisible || !currentEpisode) return null

  const episodeHref = `/episode/${currentEpisode.id}`
  const episodeAriaLabel = `View episode: ${currentEpisode.title} - ${currentEpisode.podcastTitle}`

  const queueTrigger = (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Queue"
      className="relative h-8 w-8 shrink-0"
    >
      <ListMusic className="h-4 w-4" />
      {queue.length > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
          {queue.length}
        </span>
      )}
    </Button>
  )

  const chaptersTrigger = (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Chapters"
      className="h-8 w-8 shrink-0"
    >
      {chaptersLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <BookMarked className="h-4 w-4" />
      )}
    </Button>
  )

  return (
    <div
      role="region"
      aria-label="Audio player"
      className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      {skipFlash && (
        <div
          key={skipFlash.key}
          aria-live="polite"
          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-3 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-foreground/90 px-3.5 py-2 text-[13px] font-semibold tracking-tight text-background shadow-lg animate-in fade-in slide-in-from-bottom-1 duration-200"
        >
          {skipFlash.direction === "back" ? "−" : "+"} {skipFlash.seconds}s
        </div>
      )}

      {/* Desktop layout (md+): seek bar on top, controls row underneath */}
      <div className="hidden flex-col md:flex">
        <div className="px-5 pt-2.5">
          <SeekBar />
        </div>
        <div className="grid h-16 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-5 pb-3 pt-1">
          {/* Track info (left) */}
          <Link
            href={episodeHref}
            className="group/info flex min-w-0 items-center gap-3"
            prefetch={false}
            aria-label={episodeAriaLabel}
            style={{ maxWidth: 260 }}
          >
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
              {currentEpisode.artwork ? (
                <Image
                  src={currentEpisode.artwork}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="48px"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Rss className="h-5 w-5" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p
                className="truncate text-sm font-medium group-hover/info:text-primary"
                title={currentEpisode.title}
              >
                {currentEpisode.title}
              </p>
              <p
                className="truncate text-xs text-muted-foreground"
                title={currentEpisode.podcastTitle}
              >
                {currentEpisode.podcastTitle}
              </p>
              {currentChapter && (
                <p className="truncate text-xs text-muted-foreground" data-testid="current-chapter-title">
                  {currentChapter.title}
                </p>
              )}
            </div>
          </Link>

          {/* Transport cluster — sits in the auto-sized center grid track */}
          <div className="flex items-center justify-self-center gap-2.5">
            {showNavButtons && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrevNav}
                disabled={!canGoPrev}
                aria-label={prevLabel}
                title={prevLabel}
                className="h-10 w-10"
              >
                <SkipBack className="h-5 w-5" />
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={handleSkipBack}
              aria-label={`Skip back ${REWIND_SECONDS} seconds`}
              title={`Rewind ${REWIND_SECONDS}s`}
              className="h-11 w-12 rounded-full border border-border"
            >
              <ChevronsLeft className="h-[22px] w-[22px]" />
            </Button>
            <Button
              variant="default"
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="h-14 w-14 shrink-0 rounded-full shadow-md hover:shadow-lg"
            >
              {isBuffering ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-6 w-6" />
              ) : (
                <Play className="h-6 w-6" />
              )}
            </Button>
            <Button
              variant="secondary"
              onClick={handleSkipForward}
              aria-label={`Skip forward ${FORWARD_SECONDS} seconds`}
              title={`Forward ${FORWARD_SECONDS}s`}
              className="h-11 w-12 rounded-full border border-border"
            >
              <ChevronsRight className="h-[22px] w-[22px]" />
            </Button>
            {showNavButtons && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNextNav}
                disabled={!canGoNext}
                aria-label={nextLabel}
                title={nextLabel}
                className="h-10 w-10"
              >
                <SkipForward className="h-5 w-5" />
              </Button>
            )}
          </div>

          {/* Ancillary controls (right) */}
          <div className="flex items-center justify-self-end gap-1">
            <PlaybackSpeed />
            <SleepTimerMenu />
            <BookmarkButton />
            {(hasChapters || chaptersLoading) && (
              <ChapterPanel
                open={chaptersOpen}
                onOpenChange={setChaptersOpen}
                trigger={chaptersTrigger}
              />
            )}
            {isDesktop && (
              <QueuePanel
                open={queueOpen}
                onOpenChange={setQueueOpen}
                trigger={queueTrigger}
              />
            )}
            <VolumeControl />
            <Button
              variant="ghost"
              size="icon"
              onClick={closePlayer}
              aria-label="Close player"
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile layout (<md): two rows */}
      <div className="flex flex-col md:hidden">
        {/* Top row: info + play/pause + close */}
        <div className="flex items-center gap-3 px-3 py-2">
          <Link
            href={episodeHref}
            className="group/info flex min-w-0 flex-1 items-center gap-3 active:opacity-90"
            prefetch={false}
            aria-label={episodeAriaLabel}
          >
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
              {currentEpisode.artwork ? (
                <Image
                  src={currentEpisode.artwork}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="40px"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Rss className="h-4 w-4" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-sm font-medium group-hover/info:text-primary"
                title={currentEpisode.title}
              >
                {currentEpisode.title}
              </p>
              <p
                className="truncate text-xs text-muted-foreground"
                title={currentEpisode.podcastTitle}
              >
                {currentEpisode.podcastTitle}
              </p>
              {currentChapter && (
                <p className="truncate text-xs text-muted-foreground" data-testid="current-chapter-title">
                  {currentChapter.title}
                </p>
              )}
            </div>
          </Link>
          <Button
            variant="default"
            size="icon"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="h-9 w-9 shrink-0 rounded-full"
          >
            {isBuffering ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          {(hasChapters || chaptersLoading) && (
            <ChapterPanel
              open={chaptersOpen}
              onOpenChange={setChaptersOpen}
              trigger={chaptersTrigger}
            />
          )}
          {!isDesktop && (
            <QueuePanel
              open={queueOpen}
              onOpenChange={setQueueOpen}
              trigger={queueTrigger}
            />
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={closePlayer}
            aria-label="Close player"
            className="h-8 w-8 shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Bottom row: skip + seek + speed */}
        <div className="flex items-center gap-2 px-3 pb-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSkipBack}
            aria-label={`Skip back ${REWIND_SECONDS} seconds`}
            className="h-7 w-7 shrink-0"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <SeekBar />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSkipForward}
            aria-label={`Skip forward ${FORWARD_SECONDS} seconds`}
            className="h-7 w-7 shrink-0"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
          <PlaybackSpeed />
          <SleepTimerMenu />
          <BookmarkButton />
        </div>
      </div>
    </div>
  )
}
