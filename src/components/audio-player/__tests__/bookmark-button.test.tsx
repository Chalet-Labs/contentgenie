import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookmarkButton } from "@/components/audio-player/bookmark-button";
import type { AudioPlayerState } from "@/contexts/audio-player-context";
import { BOOKMARK_CHANGED_EVENT } from "@/lib/events";
import { asPodcastIndexEpisodeId } from "@/types/ids";

const mockState: AudioPlayerState = {
  currentEpisode: {
    id: asPodcastIndexEpisodeId("ep-123"),
    title: "Test Episode",
    podcastTitle: "Test Pod",
    audioUrl: "http://example.com/a.mp3",
  },
  isPlaying: true,
  isBuffering: false,
  isVisible: true,
  duration: 300,
  volume: 1,
  playbackSpeed: 1,
  hasError: false,
  errorMessage: null,
  queue: [],
  chapters: null,
  chaptersLoading: false,
  sleepTimer: null,
};

const mockProgress = {
  currentTime: 65.7,
  buffered: 150,
};

vi.mock("@/contexts/audio-player-context", () => ({
  useAudioPlayerState: () => mockState,
  useAudioPlayerProgress: () => mockProgress,
}));

const mockGetLibraryEntry = vi.fn();
const mockAddBookmark = vi.fn();
const mockUpdateBookmark = vi.fn();

vi.mock("@/app/actions/library", () => ({
  getLibraryEntryByEpisodeId: (...args: unknown[]) =>
    mockGetLibraryEntry(...args),
  addBookmark: (...args: unknown[]) => mockAddBookmark(...args),
  updateBookmark: (...args: unknown[]) => mockUpdateBookmark(...args),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("BookmarkButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockState.currentEpisode = {
      id: asPodcastIndexEpisodeId("ep-123"),
      title: "Test Episode",
      podcastTitle: "Test Pod",
      audioUrl: "http://example.com/a.mp3",
    };
    mockGetLibraryEntry.mockResolvedValue({
      libraryEntryId: 42,
      episodeId: 10,
    });
    mockAddBookmark.mockResolvedValue({ success: true, bookmark: { id: 1 } });
    mockUpdateBookmark.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders bookmark button when episode is in library", async () => {
    render(<BookmarkButton />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Bookmark current position" }),
      ).toBeInTheDocument();
    });
  });

  it("renders nothing when episode is not in library", async () => {
    mockGetLibraryEntry.mockResolvedValue(null);
    const { container } = render(<BookmarkButton />);
    // Wait for the async resolution
    await waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("renders nothing when no episode is loaded", async () => {
    mockState.currentEpisode = null;
    const { container } = render(<BookmarkButton />);
    await waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("calls addBookmark with floored timestamp on click", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<BookmarkButton />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Bookmark current position" }),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: "Bookmark current position" }),
    );

    await waitFor(() => {
      expect(mockAddBookmark).toHaveBeenCalledWith(42, 65);
    });
  });

  it("dispatches bookmark-changed custom event on successful bookmark", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<BookmarkButton />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Bookmark current position" }),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: "Bookmark current position" }),
    );

    await waitFor(() => {
      expect(dispatchSpy).toHaveBeenCalledWith(expect.any(CustomEvent));
      const event = dispatchSpy.mock.calls.find(
        (call) => (call[0] as Event).type === BOOKMARK_CHANGED_EVENT,
      );
      expect(event).toBeTruthy();
    });

    dispatchSpy.mockRestore();
  });

  it("shows toast on successful bookmark", async () => {
    const { toast } = await import("sonner");
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<BookmarkButton />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Bookmark current position" }),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: "Bookmark current position" }),
    );

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Bookmarked at 1:05");
    });
  });
});
