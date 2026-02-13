"use client"

import { useCallback } from "react"
import { Button } from "@/components/ui/button"
import { useAudioPlayerState, useAudioPlayerAPI } from "@/contexts/audio-player-context"
import { SPEED_OPTIONS } from "@/lib/player-preferences"

export function PlaybackSpeed() {
  const { playbackSpeed } = useAudioPlayerState()
  const { setPlaybackSpeed } = useAudioPlayerAPI()

  const cycleSpeed = useCallback(() => {
    const currentIndex = (SPEED_OPTIONS as readonly number[]).indexOf(playbackSpeed)
    // If current speed is not in SPEED_OPTIONS (e.g. stale localStorage), reset to 1x
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % SPEED_OPTIONS.length
    setPlaybackSpeed(SPEED_OPTIONS[nextIndex])
  }, [playbackSpeed, setPlaybackSpeed])

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={cycleSpeed}
      aria-label={`Playback speed ${playbackSpeed}x, click to change`}
      className="min-w-[3.5rem] px-2 text-xs font-semibold tabular-nums"
    >
      {playbackSpeed}x
    </Button>
  )
}
