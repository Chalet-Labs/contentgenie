import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCurrentChapter } from "@/hooks/use-current-chapter";
import type { Chapter } from "@/lib/chapters";

const mockState: { chapters: Chapter[] | null } = {
  chapters: null,
};

const mockProgress = {
  currentTime: 0,
};

vi.mock("@/contexts/audio-player-context", () => ({
  useAudioPlayerState: () => mockState,
  useAudioPlayerProgress: () => mockProgress,
}));

describe("useCurrentChapter", () => {
  it("returns { chapter: null, index: -1 } when chapters is null", () => {
    mockState.chapters = null;
    mockProgress.currentTime = 0;

    const { result } = renderHook(() => useCurrentChapter());
    expect(result.current).toEqual({ chapter: null, index: -1 });
  });

  it("returns { chapter: null, index: -1 } when chapters is empty", () => {
    mockState.chapters = [];
    mockProgress.currentTime = 0;

    const { result } = renderHook(() => useCurrentChapter());
    expect(result.current).toEqual({ chapter: null, index: -1 });
  });

  it("returns the only chapter when there is one", () => {
    mockState.chapters = [{ startTime: 0, title: "Only Chapter" }];
    mockProgress.currentTime = 30;

    const { result } = renderHook(() => useCurrentChapter());
    expect(result.current.chapter).toEqual({
      startTime: 0,
      title: "Only Chapter",
    });
    expect(result.current.index).toBe(0);
  });

  it("returns null + index -1 when currentTime is before the first chapter", () => {
    mockState.chapters = [{ startTime: 10, title: "Chapter 1" }];
    mockProgress.currentTime = 5;

    const { result } = renderHook(() => useCurrentChapter());
    expect(result.current).toEqual({ chapter: null, index: -1 });
  });

  it("returns the correct chapter + index for various currentTime values", () => {
    mockState.chapters = [
      { startTime: 0, title: "Intro" },
      { startTime: 60, title: "Main" },
      { startTime: 300, title: "Conclusion" },
    ];

    mockProgress.currentTime = 0;
    const { result: r1 } = renderHook(() => useCurrentChapter());
    expect(r1.current.chapter?.title).toBe("Intro");
    expect(r1.current.index).toBe(0);

    mockProgress.currentTime = 30;
    const { result: r2 } = renderHook(() => useCurrentChapter());
    expect(r2.current.chapter?.title).toBe("Intro");
    expect(r2.current.index).toBe(0);

    mockProgress.currentTime = 60;
    const { result: r3 } = renderHook(() => useCurrentChapter());
    expect(r3.current.chapter?.title).toBe("Main");
    expect(r3.current.index).toBe(1);

    mockProgress.currentTime = 150;
    const { result: r4 } = renderHook(() => useCurrentChapter());
    expect(r4.current.chapter?.title).toBe("Main");
    expect(r4.current.index).toBe(1);

    mockProgress.currentTime = 300;
    const { result: r5 } = renderHook(() => useCurrentChapter());
    expect(r5.current.chapter?.title).toBe("Conclusion");
    expect(r5.current.index).toBe(2);

    mockProgress.currentTime = 600;
    const { result: r6 } = renderHook(() => useCurrentChapter());
    expect(r6.current.chapter?.title).toBe("Conclusion");
    expect(r6.current.index).toBe(2);
  });

  it("returns the chapter at the exact boundary", () => {
    mockState.chapters = [
      { startTime: 0, title: "A" },
      { startTime: 100, title: "B" },
    ];

    mockProgress.currentTime = 100;
    const { result } = renderHook(() => useCurrentChapter());
    expect(result.current.chapter?.title).toBe("B");
    expect(result.current.index).toBe(1);
  });
});
