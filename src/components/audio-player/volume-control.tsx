"use client"

import { useCallback, useRef } from "react"
import { Volume2, VolumeX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { useAudioPlayerState, useAudioPlayerAPI } from "@/contexts/audio-player-context"

export function VolumeControl() {
  const { volume } = useAudioPlayerState()
  const { setVolume } = useAudioPlayerAPI()
  const previousVolumeRef = useRef(1)

  const handleVolumeChange = useCallback(
    (value: number[]) => {
      setVolume(value[0])
    },
    [setVolume]
  )

  const toggleMute = useCallback(() => {
    if (volume > 0) {
      previousVolumeRef.current = volume
      setVolume(0)
    } else {
      setVolume(previousVolumeRef.current || 1)
    }
  }, [volume, setVolume])

  const isMuted = volume === 0

  return (
    <div className="hidden items-center gap-2 md:flex">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleMute}
        aria-label={isMuted ? "Unmute" : "Mute"}
        className="h-8 w-8"
      >
        {isMuted ? (
          <VolumeX className="h-4 w-4" />
        ) : (
          <Volume2 className="h-4 w-4" />
        )}
      </Button>
      <Slider
        aria-label="Volume"
        min={0}
        max={1}
        step={0.01}
        value={[volume]}
        onValueChange={handleVolumeChange}
        className="w-24"
      />
    </div>
  )
}
