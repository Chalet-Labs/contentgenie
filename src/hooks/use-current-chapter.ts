"use client"

import { useMemo } from "react"
import { useAudioPlayerState, useAudioPlayerProgress } from "@/contexts/audio-player-context"
import type { Chapter } from "@/lib/chapters"

export type CurrentChapter = { chapter: Chapter | null; index: number }

/**
 * Shared binary-search helper for finding the chapter index containing the
 * given time. Returns -1 when no chapter has started yet or when the list is
 * empty. Exposed so handlers can look up chapter indices from a *live* audio
 * time (e.g. `api.getCurrentTime()`) without going through React state.
 */
export function findChapterIndexAtTime(chapters: Chapter[], time: number): number {
  if (chapters.length === 0) return -1
  let low = 0
  let high = chapters.length - 1
  let index = -1
  while (low <= high) {
    const mid = (low + high) >>> 1
    if (chapters[mid].startTime <= time) {
      index = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return index
}

/**
 * Derives the currently-playing chapter and its index from playback state.
 * Uses binary search for O(log n) lookups on every timeupdate. Returns
 * `index: -1` and `chapter: null` when no chapter has started yet.
 */
export function useCurrentChapter(): CurrentChapter {
  const { chapters } = useAudioPlayerState()
  const { currentTime } = useAudioPlayerProgress()

  return useMemo(() => {
    if (!chapters || chapters.length === 0) return { chapter: null, index: -1 }
    const index = findChapterIndexAtTime(chapters, currentTime)
    return { chapter: index >= 0 ? chapters[index] : null, index }
  }, [chapters, currentTime])
}
