import { describe, it, expect, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { useCurrentChapter } from "@/hooks/use-current-chapter"
import type { Chapter } from "@/lib/chapters"

const mockState: { chapters: Chapter[] | null } = {
  chapters: null,
}

const mockProgress = {
  currentTime: 0,
}

vi.mock("@/contexts/audio-player-context", () => ({
  useAudioPlayerState: () => mockState,
  useAudioPlayerProgress: () => mockProgress,
}))

describe("useCurrentChapter", () => {
  it("returns null when chapters is null", () => {
    mockState.chapters = null
    mockProgress.currentTime = 0

    const { result } = renderHook(() => useCurrentChapter())
    expect(result.current).toBeNull()
  })

  it("returns null when chapters is empty", () => {
    mockState.chapters = []
    mockProgress.currentTime = 0

    const { result } = renderHook(() => useCurrentChapter())
    expect(result.current).toBeNull()
  })

  it("returns the only chapter when there is one", () => {
    mockState.chapters = [{ startTime: 0, title: "Only Chapter" }]
    mockProgress.currentTime = 30

    const { result } = renderHook(() => useCurrentChapter())
    expect(result.current).toEqual({ startTime: 0, title: "Only Chapter" })
  })

  it("returns null when currentTime is before the first chapter", () => {
    mockState.chapters = [{ startTime: 10, title: "Chapter 1" }]
    mockProgress.currentTime = 5

    const { result } = renderHook(() => useCurrentChapter())
    expect(result.current).toBeNull()
  })

  it("returns the correct chapter for various currentTime values", () => {
    mockState.chapters = [
      { startTime: 0, title: "Intro" },
      { startTime: 60, title: "Main" },
      { startTime: 300, title: "Conclusion" },
    ]

    // At the start
    mockProgress.currentTime = 0
    const { result: r1 } = renderHook(() => useCurrentChapter())
    expect(r1.current?.title).toBe("Intro")

    // In the middle of first chapter
    mockProgress.currentTime = 30
    const { result: r2 } = renderHook(() => useCurrentChapter())
    expect(r2.current?.title).toBe("Intro")

    // Right at the second chapter boundary
    mockProgress.currentTime = 60
    const { result: r3 } = renderHook(() => useCurrentChapter())
    expect(r3.current?.title).toBe("Main")

    // Between second and third chapters
    mockProgress.currentTime = 150
    const { result: r4 } = renderHook(() => useCurrentChapter())
    expect(r4.current?.title).toBe("Main")

    // At the last chapter
    mockProgress.currentTime = 300
    const { result: r5 } = renderHook(() => useCurrentChapter())
    expect(r5.current?.title).toBe("Conclusion")

    // After the last chapter
    mockProgress.currentTime = 600
    const { result: r6 } = renderHook(() => useCurrentChapter())
    expect(r6.current?.title).toBe("Conclusion")
  })

  it("returns the chapter at the exact boundary", () => {
    mockState.chapters = [
      { startTime: 0, title: "A" },
      { startTime: 100, title: "B" },
    ]

    mockProgress.currentTime = 100
    const { result } = renderHook(() => useCurrentChapter())
    expect(result.current?.title).toBe("B")
  })
})
