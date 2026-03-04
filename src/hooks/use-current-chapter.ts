"use client"

import { useMemo } from "react"
import { useAudioPlayerState, useAudioPlayerProgress } from "@/contexts/audio-player-context"
import type { Chapter } from "@/lib/chapters"

/**
 * Derives the currently-playing chapter from playback state.
 * Uses binary search for O(log n) lookups on every timeupdate.
 */
export function useCurrentChapter(): Chapter | null {
  const { chapters } = useAudioPlayerState()
  const { currentTime } = useAudioPlayerProgress()

  return useMemo(() => {
    if (!chapters || chapters.length === 0) return null

    // Binary search: find the last chapter where startTime <= currentTime
    let low = 0
    let high = chapters.length - 1
    let result: Chapter | null = null

    while (low <= high) {
      const mid = (low + high) >>> 1
      if (chapters[mid].startTime <= currentTime) {
        result = chapters[mid]
        low = mid + 1
      } else {
        high = mid - 1
      }
    }

    return result
  }, [chapters, currentTime])
}
