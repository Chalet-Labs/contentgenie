"use client"

import { useEffect, useReducer } from "react"
import { Moon, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  useAudioPlayerState,
  useAudioPlayerAPI,
} from "@/contexts/audio-player-context"
import { formatTime } from "@/lib/format-time"

const PRESETS = [15, 30, 45, 60] as const

export function SleepTimerMenu() {
  const { sleepTimer } = useAudioPlayerState()
  const { setSleepTimer, cancelSleepTimer } = useAudioPlayerAPI()

  // Local tick drives countdown display — avoids 1/sec re-renders in shared state context
  const [, tick] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    if (!sleepTimer || sleepTimer.type !== "duration" || sleepTimer.endTime === null) return
    const id = setInterval(tick, 1000)
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [sleepTimer])

  const isActive = sleepTimer !== null
  const isDuration = sleepTimer?.type === "duration"
  const isEndOfEpisode = sleepTimer?.type === "end-of-episode"

  const remainingSeconds = sleepTimer?.endTime
    ? Math.max(0, Math.ceil((sleepTimer.endTime - Date.now()) / 1000))
    : 0

  const ariaLabel = isActive
    ? isDuration
      ? `Sleep timer — ${Math.ceil(remainingSeconds / 60)} minutes remaining`
      : "Sleep timer — end of episode"
    : "Sleep timer"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={ariaLabel}
          className="relative h-8 w-auto min-w-8 gap-1 px-1.5"
        >
          <Moon
            className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
            fill={isActive ? "currentColor" : "none"}
          />
          {isDuration && remainingSeconds > 0 && (
            <span className="text-xs font-semibold tabular-nums text-primary">
              {formatTime(remainingSeconds)}
            </span>
          )}
          {isEndOfEpisode && (
            <span className="text-xs font-semibold text-primary">End</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" sideOffset={12}>
        {isActive && (
          <>
            <DropdownMenuItem onClick={() => cancelSleepTimer()}>
              Cancel timer
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {PRESETS.map((minutes) => (
          <DropdownMenuItem
            key={minutes}
            onClick={() => setSleepTimer(minutes)}
          >
            <span className="flex-1">{minutes} minutes</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setSleepTimer("end-of-episode")}>
          <span className="flex-1">End of episode</span>
          {isEndOfEpisode && <Check className="h-4 w-4" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
