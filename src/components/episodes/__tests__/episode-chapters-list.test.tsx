import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EpisodeChaptersList } from "@/components/episodes/episode-chapters-list";
import type { UseChaptersState } from "@/hooks/use-chapters";
import type { AudioEpisode } from "@/contexts/audio-player-context";

const mocks = vi.hoisted(() => ({
  useAudioPlayerState:
    vi.fn<
      () => { currentEpisode: { id: string } | null; isPlaying: boolean }
    >(),
  useAudioPlayerProgress: vi.fn(),
  useAudioPlayerAPI: vi.fn(),
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

function mockApi() {
  const playEpisode = vi.fn();
  const seek = vi.fn();
  const togglePlay = vi.fn();
  mocks.useAudioPlayerAPI.mockReturnValue({ playEpisode, seek, togglePlay });
  return { playEpisode, seek, togglePlay };
}

function mockCurrentEpisode({
  isPlaying = false,
}: { isPlaying?: boolean } = {}) {
  mocks.useAudioPlayerState.mockReturnValue({
    currentEpisode: { id: sampleEpisode.id },
    isPlaying,
  });
}

async function clickChapter(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByText(name));
}

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
    mockApi();
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

  it("renders a neutral placeholder for idle state without showing the skeleton", () => {
    const { container } = render(
      <EpisodeChaptersList
        state={{ status: "idle" }}
        audioEpisode={sampleEpisode}
      />,
    );

    expect(
      screen.getByText(/Chapters unavailable right now/),
    ).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBe(0);
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
    const api = mockApi();

    render(
      <EpisodeChaptersList
        state={readyState(2)}
        audioEpisode={sampleEpisode}
      />,
    );

    await clickChapter("Chapter 2");

    expect(api.playEpisode).toHaveBeenCalledWith(sampleEpisode, {
      startAt: 300,
    });
  });

  it("disables non-current chapter rows and skips playEpisode when canPlay=false", async () => {
    const api = mockApi();

    render(
      <EpisodeChaptersList
        state={readyState(2)}
        audioEpisode={sampleEpisode}
        canPlay={false}
      />,
    );

    const row = screen.getByText("Chapter 2").closest("button");
    expect(row).toBeDisabled();

    await clickChapter("Chapter 2");
    expect(api.playEpisode).not.toHaveBeenCalled();
  });

  it("keeps current-episode seek+resume working even when canPlay=false", async () => {
    mockCurrentEpisode({ isPlaying: false });
    const api = mockApi();

    render(
      <EpisodeChaptersList
        state={readyState(2)}
        audioEpisode={sampleEpisode}
        canPlay={false}
      />,
    );

    const row = screen.getByText("Chapter 2").closest("button");
    expect(row).not.toBeDisabled();

    await clickChapter("Chapter 2");
    expect(api.seek).toHaveBeenCalledWith(300);
    expect(api.togglePlay).toHaveBeenCalledTimes(1);
    expect(api.playEpisode).not.toHaveBeenCalled();
  });

  it("seeks and resumes playback when the current episode matches and is paused", async () => {
    mockCurrentEpisode({ isPlaying: false });
    const api = mockApi();

    render(
      <EpisodeChaptersList
        state={readyState(2)}
        audioEpisode={sampleEpisode}
      />,
    );

    await clickChapter("Chapter 2");

    expect(api.seek).toHaveBeenCalledWith(300);
    expect(api.togglePlay).toHaveBeenCalledTimes(1);
    expect(api.playEpisode).not.toHaveBeenCalled();
  });

  it("only seeks (does not toggle) when the current episode is already playing", async () => {
    mockCurrentEpisode({ isPlaying: true });
    const api = mockApi();

    render(
      <EpisodeChaptersList
        state={readyState(2)}
        audioEpisode={sampleEpisode}
      />,
    );

    await clickChapter("Chapter 2");

    expect(api.seek).toHaveBeenCalledWith(300);
    expect(api.togglePlay).not.toHaveBeenCalled();
    expect(api.playEpisode).not.toHaveBeenCalled();
  });

  it("highlights the active chapter with aria-current when the current episode is playing past its start time", () => {
    mockCurrentEpisode({ isPlaying: true });
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
