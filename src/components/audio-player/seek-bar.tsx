"use client"

import { useCallback } from "react"
import { Slider } from "@/components/ui/slider"
import { useAudioPlayerProgress, useAudioPlayerAPI, useAudioPlayerState } from "@/contexts/audio-player-context"

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00"
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export function SeekBar() {
  const { currentTime, buffered } = useAudioPlayerProgress()
  const { duration } = useAudioPlayerState()
  const { seek } = useAudioPlayerAPI()

  const handleSeek = useCallback(
    (value: number[]) => {
      seek(value[0])
    },
    [seek]
  )

  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0

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
