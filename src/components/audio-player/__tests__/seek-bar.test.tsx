import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SeekBar } from "@/components/audio-player/seek-bar";

// Radix Slider uses ResizeObserver which jsdom doesn't provide
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver =
  MockResizeObserver as unknown as typeof ResizeObserver;

const mockState = {
  duration: 300,
  currentEpisode: {
    id: "ep-123",
    title: "Test",
    podcastTitle: "Pod",
    audioUrl: "http://example.com/a.mp3",
  },
  isPlaying: false,
  isBuffering: false,
  isVisible: true,
  volume: 1,
  playbackSpeed: 1,
  hasError: false,
  errorMessage: null,
  chapters: null as { startTime: number; title: string }[] | null,
  chaptersLoading: false,
  queue: [],
  sleepTimer: null,
};

const mockProgress = {
  currentTime: 65,
  buffered: 150,
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
  setSleepTimer: vi.fn(),
  cancelSleepTimer: vi.fn(),
};

vi.mock("@/contexts/audio-player-context", () => ({
  useAudioPlayerState: () => mockState,
  useAudioPlayerProgress: () => mockProgress,
  useAudioPlayerAPI: () => mockAPI,
}));

vi.mock("@/app/actions/library", () => ({
  getLibraryEntryByEpisodeId: vi.fn().mockResolvedValue(null),
  getBookmarks: vi.fn().mockResolvedValue({ bookmarks: [], error: null }),
}));

describe("SeekBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProgress.currentTime = 65;
    mockProgress.buffered = 150;
    mockState.duration = 300;
    mockState.chapters = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("displays formatted current time", () => {
    render(<SeekBar />);
    // 65 seconds = 1:05
    expect(screen.getByText("1:05")).toBeInTheDocument();
  });

  it("displays formatted duration", () => {
    render(<SeekBar />);
    // 300 seconds = 5:00
    expect(screen.getByText("5:00")).toBeInTheDocument();
  });

  it("renders a slider", () => {
    render(<SeekBar />);
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  it("shows 0:00 when currentTime is 0", () => {
    mockProgress.currentTime = 0;
    render(<SeekBar />);
    expect(screen.getByText("0:00")).toBeInTheDocument();
  });

  it("renders buffered range indicator", () => {
    const { container } = render(<SeekBar />);
    // buffered = 150 / 300 = 50%
    const bufferedDiv = container.querySelector("[style]");
    expect(bufferedDiv).toBeTruthy();
    expect(bufferedDiv?.getAttribute("style")).toContain("50%");
  });

  it("renders no chapter tick marks when chapters is null", () => {
    mockState.chapters = null;
    const { container } = render(<SeekBar />);
    expect(
      container.querySelectorAll("[data-testid='chapter-tick']"),
    ).toHaveLength(0);
  });

  it("renders no chapter tick marks when chapters is an empty array", () => {
    mockState.chapters = [];
    const { container } = render(<SeekBar />);
    expect(
      container.querySelectorAll("[data-testid='chapter-tick']"),
    ).toHaveLength(0);
  });

  it("renders tick marks for chapters with startTime > 0", () => {
    mockState.chapters = [
      { startTime: 0, title: "Intro" },
      { startTime: 60, title: "Main" },
      { startTime: 180, title: "Outro" },
    ];
    const { container } = render(<SeekBar />);
    // First chapter at time 0 should be skipped
    const ticks = container.querySelectorAll("[data-testid='chapter-tick']");
    expect(ticks).toHaveLength(2);
  });

  it("positions chapter ticks at correct percentage of duration", () => {
    mockState.chapters = [
      { startTime: 0, title: "Intro" },
      { startTime: 150, title: "Midpoint" }, // 150/300 = 50%
    ];
    const { container } = render(<SeekBar />);
    const ticks = container.querySelectorAll("[data-testid='chapter-tick']");
    expect(ticks).toHaveLength(1);
    expect((ticks[0] as HTMLElement).style.left).toBe("50%");
  });

  it("includes chapter title as tooltip on tick marks", () => {
    mockState.chapters = [
      { startTime: 0, title: "Intro" },
      { startTime: 60, title: "Main Topic" },
    ];
    const { container } = render(<SeekBar />);
    const ticks = container.querySelectorAll("[data-testid='chapter-tick']");
    expect(ticks[0]).toHaveAttribute("title", "Main Topic");
  });

  it("renders no tick marks when duration is 0", () => {
    mockState.duration = 0;
    mockState.chapters = [
      { startTime: 0, title: "Intro" },
      { startTime: 60, title: "Main" },
    ];
    const { container } = render(<SeekBar />);
    expect(
      container.querySelectorAll("[data-testid='chapter-tick']"),
    ).toHaveLength(0);
  });

  describe("bookmark indicators", () => {
    it("renders no bookmark dots when episode is not in library", async () => {
      const { getLibraryEntryByEpisodeId } =
        await import("@/app/actions/library");
      vi.mocked(getLibraryEntryByEpisodeId).mockResolvedValue(null);

      const { container } = render(<SeekBar />);
      // Allow async effects to settle
      await vi.waitFor(() => {
        expect(
          container.querySelectorAll("[data-testid='bookmark-dot']"),
        ).toHaveLength(0);
      });
    });

    it("renders bookmark dots when episode has bookmarks", async () => {
      const { getLibraryEntryByEpisodeId, getBookmarks } =
        await import("@/app/actions/library");
      vi.mocked(getLibraryEntryByEpisodeId).mockResolvedValue({
        libraryEntryId: 1,
        episodeId: 10,
      });
      vi.mocked(getBookmarks).mockResolvedValue({
        bookmarks: [
          {
            id: 1,
            userLibraryId: 1,
            timestamp: 60,
            note: "Good point",
            createdAt: new Date(),
          },
          {
            id: 2,
            userLibraryId: 1,
            timestamp: 150,
            note: null,
            createdAt: new Date(),
          },
        ],
        error: null,
      });

      const { container } = render(<SeekBar />);
      await vi.waitFor(() => {
        expect(
          container.querySelectorAll("[data-testid='bookmark-dot']"),
        ).toHaveLength(2);
      });
    });

    it("positions bookmark dots at correct percentage", async () => {
      const { getLibraryEntryByEpisodeId, getBookmarks } =
        await import("@/app/actions/library");
      vi.mocked(getLibraryEntryByEpisodeId).mockResolvedValue({
        libraryEntryId: 1,
        episodeId: 10,
      });
      vi.mocked(getBookmarks).mockResolvedValue({
        bookmarks: [
          {
            id: 1,
            userLibraryId: 1,
            timestamp: 150,
            note: null,
            createdAt: new Date(),
          }, // 150/300 = 50%
        ],
        error: null,
      });

      const { container } = render(<SeekBar />);
      await vi.waitFor(() => {
        const dots = container.querySelectorAll("[data-testid='bookmark-dot']");
        expect(dots).toHaveLength(1);
        expect((dots[0] as HTMLElement).style.left).toBe("50%");
      });
    });
  });
});
