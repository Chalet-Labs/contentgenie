"use client"

import { useCallback, useMemo } from "react"
import { Slider } from "@/components/ui/slider"
import { useAudioPlayerProgress, useAudioPlayerAPI, useAudioPlayerState } from "@/contexts/audio-player-context"
import { formatTime } from "@/lib/format-time"

export function SeekBar() {
  const { currentTime, buffered } = useAudioPlayerProgress()
  const { duration, chapters } = useAudioPlayerState()
  const { seek } = useAudioPlayerAPI()

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
      .filter((ch) => ch.startTime > 0)
      .map((ch) => ({ startTime: ch.startTime, title: ch.title, left: (ch.startTime / duration) * 100 }))
  }, [chapters, duration])

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
