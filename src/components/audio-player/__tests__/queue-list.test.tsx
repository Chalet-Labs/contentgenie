import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type {
  AudioEpisode,
  AudioPlayerState,
} from "@/contexts/audio-player-context";
import { asPodcastIndexEpisodeId } from "@/types/ids";

// QueueList lives at the seam between the audio player and the dashboard. The
// other consumer's tests (queue-panel.test.tsx) exercise behaviour through the
// QueuePanel wrapper. This file pins QueueList's own contract so it stays
// covered if either consumer is restructured.

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

function makeEpisode(
  overrides: Partial<Omit<AudioEpisode, "id">> & { id?: string } = {},
): AudioEpisode {
  const { id = "1001", ...rest } = overrides;
  return {
    id: asPodcastIndexEpisodeId(id),
    title: "Test Episode",
    podcastTitle: "Test Podcast",
    audioUrl: "https://example.com/audio.mp3",
    ...rest,
  };
}

async function renderQueueList(maxHeight?: string) {
  const { QueueList } = await import("@/components/audio-player/queue-list");
  return render(<QueueList maxHeight={maxHeight} />);
}

describe("QueueList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.currentEpisode = null;
    mockState.queue = [];
  });

  it("renders the empty-state placeholder when nothing is queued", async () => {
    await renderQueueList();
    expect(screen.getByText("Your queue is empty")).toBeInTheDocument();
    expect(
      screen.getByText("Add episodes from episode pages or cards"),
    ).toBeInTheDocument();
  });

  it("renders queued items with the Up Next header and Clear all button", async () => {
    mockState.queue = [
      makeEpisode({ id: "1001", title: "First Up", podcastTitle: "Pod A" }),
      makeEpisode({ id: "1002", title: "Second Up", podcastTitle: "Pod B" }),
    ];
    await renderQueueList();
    expect(screen.getByText("Up Next")).toBeInTheDocument();
    expect(screen.getByText("First Up")).toBeInTheDocument();
    expect(screen.getByText("Second Up")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /clear all/i }),
    ).toBeInTheDocument();
  });

  it("does not apply a height cap when maxHeight is omitted", async () => {
    mockState.queue = [makeEpisode({ id: "1001", title: "Item" })];
    const { container } = await renderQueueList();
    const scrollHost = container.querySelector(".overflow-y-auto");
    expect(scrollHost).toBeNull();
  });

  it("applies overflow-y-auto and inline maxHeight when the prop is set", async () => {
    mockState.queue = [makeEpisode({ id: "1001", title: "Item" })];
    const { container } = await renderQueueList("50vh");
    const scrollHost =
      container.querySelector<HTMLDivElement>(".overflow-y-auto");
    expect(scrollHost).not.toBeNull();
    expect(scrollHost?.style.maxHeight).toBe("50vh");
  });
});
