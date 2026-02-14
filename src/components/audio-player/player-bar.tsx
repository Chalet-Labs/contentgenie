"use client"

import Image from "next/image"
import Link from "next/link"
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  X,
  Loader2,
  Rss,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  useAudioPlayerState,
  useAudioPlayerAPI,
} from "@/contexts/audio-player-context"
import { SeekBar } from "@/components/audio-player/seek-bar"
import { PlaybackSpeed } from "@/components/audio-player/playback-speed"
import { VolumeControl } from "@/components/audio-player/volume-control"

export function PlayerBar() {
  const { currentEpisode, isPlaying, isBuffering, isVisible } =
    useAudioPlayerState()
  const { togglePlay, skipBack, skipForward, closePlayer } =
    useAudioPlayerAPI()

  if (!isVisible || !currentEpisode) return null

  return (
    <div
      role="region"
      aria-label="Audio player"
      className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      {/* Desktop layout (md+): single row */}
      <div className="hidden h-[72px] items-center gap-4 px-4 md:flex">
        {/* Track info (left) */}
        <Link
          href={`/episode/${currentEpisode.id}`}
          className="group/info flex min-w-0 flex-1 items-center gap-3"
          prefetch={false}
          aria-label={`View episode: ${currentEpisode.title} - ${currentEpisode.podcastTitle}`}
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
          </div>
        </Link>

        {/* Controls (center) */}
        <div className="flex w-full max-w-xl flex-col items-center gap-1">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => skipBack()}
              aria-label="Skip back 15 seconds"
              className="h-8 w-8"
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              variant="default"
              size="icon"
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="h-9 w-9"
            >
              {isBuffering ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => skipForward()}
              aria-label="Skip forward 15 seconds"
              className="h-8 w-8"
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
          <SeekBar />
        </div>

        {/* Volume/Speed/Close (right) */}
        <div className="flex flex-1 items-center justify-end gap-2">
          <PlaybackSpeed />
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

      {/* Mobile layout (<md): two rows */}
      <div className="flex flex-col md:hidden">
        {/* Top row: info + play/pause + close */}
        <div className="flex items-center gap-3 px-3 py-2">
          <Link
            href={`/episode/${currentEpisode.id}`}
            className="group/info flex min-w-0 flex-1 items-center gap-3 active:opacity-90"
            prefetch={false}
            aria-label={`View episode: ${currentEpisode.title} - ${currentEpisode.podcastTitle}`}
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
            </div>
          </Link>
          <Button
            variant="default"
            size="icon"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="h-8 w-8 shrink-0"
          >
            {isBuffering ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
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
            onClick={() => skipBack()}
            aria-label="Skip back 15 seconds"
            className="h-7 w-7 shrink-0"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </Button>
          <div className="flex-1">
            <SeekBar />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => skipForward()}
            aria-label="Skip forward 15 seconds"
            className="h-7 w-7 shrink-0"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </Button>
          <PlaybackSpeed />
        </div>
      </div>
    </div>
  )
}
