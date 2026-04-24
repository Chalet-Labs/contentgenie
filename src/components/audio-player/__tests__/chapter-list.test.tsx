import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChapterList } from "@/components/audio-player/chapter-list";
import type { Chapter } from "@/lib/chapters";

const mockState: {
  chapters: Chapter[] | null;
  chaptersLoading: boolean;
} = {
  chapters: null,
  chaptersLoading: false,
};

const mockProgress = {
  currentTime: 0,
  buffered: 0,
};

const mockAPI = {
  playEpisode: vi.fn(),
  togglePlay: vi.fn(),
  seek: vi.fn(),
  skipForward: vi.fn(),
  skipBack: vi.fn(),
  setVolume: vi.fn(),
  setPlaybackSpeed: vi.fn(),
  closePlayer: vi.fn(),
  addToQueue: vi.fn(),
  removeFromQueue: vi.fn(),
  reorderQueue: vi.fn(),
  clearQueue: vi.fn(),
  playNext: vi.fn(),
};

vi.mock("@/contexts/audio-player-context", () => ({
  useAudioPlayerState: () => mockState,
  useAudioPlayerProgress: () => mockProgress,
  useAudioPlayerAPI: () => mockAPI,
}));

vi.mock("@/hooks/use-current-chapter", () => ({
  useCurrentChapter: () => {
    if (!mockState.chapters || mockState.chapters.length === 0) {
      return { chapter: null, index: -1 };
    }
    let chapter: Chapter | null = null;
    let index = -1;
    for (let i = 0; i < mockState.chapters.length; i++) {
      const ch = mockState.chapters[i];
      if (ch.startTime <= mockProgress.currentTime) {
        chapter = ch;
        index = i;
      } else break;
    }
    return { chapter, index };
  },
}));

describe("ChapterList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.chapters = null;
    mockState.chaptersLoading = false;
    mockProgress.currentTime = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows empty state when chapters is null", () => {
    mockState.chapters = null;
    render(<ChapterList />);
    expect(screen.getByText("No chapters")).toBeInTheDocument();
  });

  it("shows empty state when chapters is empty array", () => {
    mockState.chapters = [];
    render(<ChapterList />);
    expect(screen.getByText("No chapters")).toBeInTheDocument();
  });

  it("renders chapter titles and times", () => {
    mockState.chapters = [
      { startTime: 0, title: "Introduction" },
      { startTime: 60, title: "Main Topic" },
      { startTime: 300, title: "Conclusion" },
    ];

    render(<ChapterList />);

    expect(screen.getByText("Introduction")).toBeInTheDocument();
    expect(screen.getByText("0:00")).toBeInTheDocument();
    expect(screen.getByText("Main Topic")).toBeInTheDocument();
    expect(screen.getByText("1:00")).toBeInTheDocument();
    expect(screen.getByText("Conclusion")).toBeInTheDocument();
    expect(screen.getByText("5:00")).toBeInTheDocument();
  });

  it("calls seek with correct time when a chapter is clicked", () => {
    mockState.chapters = [
      { startTime: 0, title: "Introduction" },
      { startTime: 120, title: "Main Topic" },
    ];

    render(<ChapterList />);

    fireEvent.click(screen.getByText("Main Topic"));
    expect(mockAPI.seek).toHaveBeenCalledWith(120);
  });

  it("highlights the active chapter", () => {
    mockState.chapters = [
      { startTime: 0, title: "Introduction" },
      { startTime: 60, title: "Main Topic" },
    ];
    mockProgress.currentTime = 30;

    render(<ChapterList />);

    const introButton = screen.getByText("Introduction").closest("button");
    const mainButton = screen.getByText("Main Topic").closest("button");

    expect(introButton?.className).toContain("bg-primary/10");
    expect(mainButton?.className).not.toContain("bg-primary/10");
  });
});
