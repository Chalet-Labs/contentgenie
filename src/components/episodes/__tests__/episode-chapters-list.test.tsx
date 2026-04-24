import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EpisodeChaptersList } from "@/components/episodes/episode-chapters-list";
import type { UseChaptersState } from "@/hooks/use-chapters";
import type { AudioEpisode } from "@/contexts/audio-player-context";

const mocks = vi.hoisted(() => ({
  useAudioPlayerState: vi.fn<
    () => { currentEpisode: { id: string } | null; isPlaying: boolean }
  >(() => ({
    currentEpisode: null,
    isPlaying: false,
  })),
  useAudioPlayerProgress: vi.fn(() => ({ currentTime: 0, buffered: 0 })),
  useAudioPlayerAPI: vi.fn(() => ({
    playEpisode: vi.fn(),
    seek: vi.fn(),
    togglePlay: vi.fn(),
  })),
}));

vi.mock("@/contexts/audio-player-context", () => ({
  useAudioPlayerState: mocks.useAudioPlayerState,
  useAudioPlayerProgress: mocks.useAudioPlayerProgress,
  useAudioPlayerAPI: mocks.useAudioPlayerAPI,
}));

const sampleEpisode: AudioEpisode = {
  id: "ep-1",
  title: "Sample Episode",
  podcastTitle: "Sample Podcast",
  audioUrl: "https://example.com/audio.mp3",
  artwork: "https://example.com/art.jpg",
  duration: 1800,
};

const readyState = (count = 3): UseChaptersState => ({
  status: "ready",
  chapters: Array.from({ length: count }, (_, i) => ({
    startTime: i * 300,
    title: `Chapter ${i + 1}`,
  })),
});

describe("EpisodeChaptersList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAudioPlayerState.mockReturnValue({
      currentEpisode: null,
      isPlaying: false,
    });
    mocks.useAudioPlayerProgress.mockReturnValue({
      currentTime: 0,
      buffered: 0,
    });
  });

  it("renders a loading skeleton while chapters are fetching", () => {
    const { container } = render(
      <EpisodeChaptersList
        state={{ status: "loading" }}
        audioEpisode={sampleEpisode}
      />,
    );

    // Skeleton components render as div elements; look for the known skeleton class.
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0,
    );
  });

  it("shows the error message when the chapter fetch fails", () => {
    render(
      <EpisodeChaptersList
        state={{ status: "error", message: "HTTP 500" }}
        audioEpisode={sampleEpisode}
      />,
    );

    expect(screen.getByText(/Couldn't load chapters\./)).toBeInTheDocument();
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
  });

  it("renders the empty-state copy when no chapters are returned", () => {
    render(
      <EpisodeChaptersList
        state={{ status: "ready", chapters: [] }}
        audioEpisode={sampleEpisode}
      />,
    );

    expect(
      screen.getByText(/No chapters available for this episode\./),
    ).toBeInTheDocument();
  });

  it("renders each chapter with its formatted timestamp", () => {
    render(
      <EpisodeChaptersList
        state={readyState(3)}
        audioEpisode={sampleEpisode}
      />,
    );

    expect(screen.getByText("Chapter 1")).toBeInTheDocument();
    expect(screen.getByText("Chapter 2")).toBeInTheDocument();
    expect(screen.getByText("Chapter 3")).toBeInTheDocument();
    expect(screen.getByText("0:00")).toBeInTheDocument();
    expect(screen.getByText("5:00")).toBeInTheDocument();
    expect(screen.getByText("10:00")).toBeInTheDocument();
  });

  it("calls playEpisode with the chapter start time when the episode isn't current", async () => {
    const playEpisode = vi.fn();
    mocks.useAudioPlayerAPI.mockReturnValue({
      playEpisode,
      seek: vi.fn(),
      togglePlay: vi.fn(),
    });

    render(
      <EpisodeChaptersList
        state={readyState(2)}
        audioEpisode={sampleEpisode}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByText("Chapter 2"));

    expect(playEpisode).toHaveBeenCalledWith(sampleEpisode, { startAt: 300 });
  });

  it("disables non-current chapter rows and skips playEpisode when canPlay=false", async () => {
    const playEpisode = vi.fn();
    mocks.useAudioPlayerAPI.mockReturnValue({
      playEpisode,
      seek: vi.fn(),
      togglePlay: vi.fn(),
    });

    render(
      <EpisodeChaptersList
        state={readyState(2)}
        audioEpisode={sampleEpisode}
        canPlay={false}
      />,
    );

    const row = screen.getByText("Chapter 2").closest("button");
    expect(row).toBeDisabled();

    const user = userEvent.setup();
    await user.click(screen.getByText("Chapter 2"));
    expect(playEpisode).not.toHaveBeenCalled();
  });

  it("keeps current-episode seek+resume working even when canPlay=false", async () => {
    const seek = vi.fn();
    const togglePlay = vi.fn();
    const playEpisode = vi.fn();
    mocks.useAudioPlayerState.mockReturnValue({
      currentEpisode: { id: sampleEpisode.id },
      isPlaying: false,
    });
    mocks.useAudioPlayerAPI.mockReturnValue({ seek, playEpisode, togglePlay });

    render(
      <EpisodeChaptersList
        state={readyState(2)}
        audioEpisode={sampleEpisode}
        canPlay={false}
      />,
    );

    const row = screen.getByText("Chapter 2").closest("button");
    expect(row).not.toBeDisabled();

    const user = userEvent.setup();
    await user.click(screen.getByText("Chapter 2"));
    expect(seek).toHaveBeenCalledWith(300);
    expect(togglePlay).toHaveBeenCalledTimes(1);
    expect(playEpisode).not.toHaveBeenCalled();
  });

  it("seeks and resumes playback when the current episode matches and is paused", async () => {
    const seek = vi.fn();
    const playEpisode = vi.fn();
    const togglePlay = vi.fn();
    mocks.useAudioPlayerState.mockReturnValue({
      currentEpisode: { id: sampleEpisode.id },
      isPlaying: false,
    });
    mocks.useAudioPlayerAPI.mockReturnValue({ seek, playEpisode, togglePlay });

    render(
      <EpisodeChaptersList
        state={readyState(2)}
        audioEpisode={sampleEpisode}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByText("Chapter 2"));

    expect(seek).toHaveBeenCalledWith(300);
    expect(togglePlay).toHaveBeenCalledTimes(1);
    expect(playEpisode).not.toHaveBeenCalled();
  });

  it("only seeks (does not toggle) when the current episode is already playing", async () => {
    const seek = vi.fn();
    const playEpisode = vi.fn();
    const togglePlay = vi.fn();
    mocks.useAudioPlayerState.mockReturnValue({
      currentEpisode: { id: sampleEpisode.id },
      isPlaying: true,
    });
    mocks.useAudioPlayerAPI.mockReturnValue({ seek, playEpisode, togglePlay });

    render(
      <EpisodeChaptersList
        state={readyState(2)}
        audioEpisode={sampleEpisode}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByText("Chapter 2"));

    expect(seek).toHaveBeenCalledWith(300);
    expect(togglePlay).not.toHaveBeenCalled();
    expect(playEpisode).not.toHaveBeenCalled();
  });

  it("highlights the active chapter with aria-current when the current episode is playing past its start time", () => {
    mocks.useAudioPlayerState.mockReturnValue({
      currentEpisode: { id: sampleEpisode.id },
      isPlaying: true,
    });
    mocks.useAudioPlayerProgress.mockReturnValue({
      currentTime: 310, // inside chapter 2
      buffered: 0,
    });

    render(
      <EpisodeChaptersList
        state={readyState(3)}
        audioEpisode={sampleEpisode}
      />,
    );

    const activeRow = screen.getByText("Chapter 2").closest("button");
    expect(activeRow).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("Chapter 1").closest("button")).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("formats timestamps past one hour as H:MM:SS", () => {
    const state: UseChaptersState = {
      status: "ready",
      chapters: [
        { startTime: 0, title: "Start" },
        { startTime: 3725, title: "Late" }, // 1:02:05
      ],
    };
    render(<EpisodeChaptersList state={state} audioEpisode={sampleEpisode} />);
    expect(screen.getByText("1:02:05")).toBeInTheDocument();
  });

  it("does not flag any chapter as active when the episode isn't currently playing", () => {
    mocks.useAudioPlayerProgress.mockReturnValue({
      currentTime: 600,
      buffered: 0,
    });

    render(
      <EpisodeChaptersList
        state={readyState(3)}
        audioEpisode={sampleEpisode}
      />,
    );

    expect(
      screen.queryByText("Chapter 1")?.closest("button"),
    ).not.toHaveAttribute("aria-current");
    expect(
      screen.queryByText("Chapter 3")?.closest("button"),
    ).not.toHaveAttribute("aria-current");
  });
});
