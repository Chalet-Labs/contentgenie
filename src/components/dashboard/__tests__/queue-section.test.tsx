import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AudioEpisode,
  AudioPlayerState,
} from "@/contexts/audio-player-context";
import { asPodcastIndexEpisodeId } from "@/types/ids";

// ---------------------------------------------------------------------------
// Mocks — QueueSection now wraps QueueList, which reads both state + API
// ---------------------------------------------------------------------------

const mockState: AudioPlayerState = {
  currentEpisode: null,
  isPlaying: false,
  isBuffering: false,
  isVisible: false,
  duration: 0,
  volume: 1,
  playbackSpeed: 1,
  hasError: false,
  errorMessage: null,
  queue: [],
  chapters: null,
  chaptersLoading: false,
  sleepTimer: null,
};

const mockAPI = {
  playEpisode: vi.fn(),
  removeFromQueue: vi.fn(),
  reorderQueue: vi.fn(),
  clearQueue: vi.fn(),
};

vi.mock("@/contexts/audio-player-context", () => ({
  useAudioPlayerState: () => mockState,
  useAudioPlayerAPI: () => mockAPI,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MakeEpisodeOverrides = Partial<Omit<AudioEpisode, "id">> & { id?: string };

function makeEpisode(overrides: MakeEpisodeOverrides = {}): AudioEpisode {
  const { id = "1001", ...rest } = overrides;
  return {
    id: asPodcastIndexEpisodeId(id),
    title: "Test Episode",
    podcastTitle: "Test Podcast",
    audioUrl: "https://example.com/audio.mp3",
    ...rest,
  };
}

async function renderQueueSection() {
  const { QueueSection } = await import("@/components/dashboard/queue-section");
  return render(<QueueSection />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("QueueSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.currentEpisode = null;
    mockState.queue = [];
  });

  it("renders the QueueList empty state when queue is empty and nothing is playing", async () => {
    await renderQueueSection();
    expect(screen.getByText("Your queue is empty")).toBeInTheDocument();
  });

  it("does not render the count badge when queue is empty and nothing is playing", async () => {
    await renderQueueSection();
    // No <span> with a count next to the "Queue" title
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("renders queue items via QueueList", async () => {
    mockState.queue = [
      makeEpisode({ id: "1001", title: "Ep 1", podcastTitle: "Pod A" }),
      makeEpisode({ id: "1002", title: "Ep 2", podcastTitle: "Pod B" }),
    ];
    await renderQueueSection();
    expect(screen.getByText("Ep 1")).toBeInTheDocument();
    expect(screen.getByText("Ep 2")).toBeInTheDocument();
    expect(screen.getByText("Pod A")).toBeInTheDocument();
  });

  it("count badge reflects queue length when nothing is playing", async () => {
    mockState.queue = [
      makeEpisode({ id: "1001" }),
      makeEpisode({ id: "1002" }),
    ];
    await renderQueueSection();
    // Two badges show "2" here: the CardHeader total badge and QueueList's
    // "Up Next" badge — equal because total = queue length when nothing plays.
    expect(screen.getAllByText("2")).toHaveLength(2);
  });

  it("count badge includes the current episode in the total", async () => {
    mockState.currentEpisode = makeEpisode({ id: "2001" });
    mockState.queue = [makeEpisode({ id: "1001" })];
    await renderQueueSection();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders the Now Playing header (from QueueList) when an episode is current", async () => {
    mockState.currentEpisode = makeEpisode({
      id: "2001",
      title: "Now Playing Ep",
    });
    await renderQueueSection();
    // QueueList renders a "Now Playing" label above the artwork tile
    expect(screen.getByText("Now Playing")).toBeInTheDocument();
    expect(screen.getByText("Now Playing Ep")).toBeInTheDocument();
  });

  it("clicking a queue row forwards play+remove to the audio player API", async () => {
    mockState.queue = [makeEpisode({ id: "1001", title: "Clickable Ep" })];
    await renderQueueSection();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /play clickable ep/i }),
    );
    expect(mockAPI.playEpisode).toHaveBeenCalledTimes(1);
    expect(mockAPI.removeFromQueue).toHaveBeenCalledTimes(1);
  });
});
