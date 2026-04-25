import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AudioEpisode,
  AudioPlayerState,
} from "@/contexts/audio-player-context";
import { asPodcastIndexEpisodeId } from "@/types/ids";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Audio player context state — mutated per test
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

vi.mock("@/contexts/audio-player-context", () => ({
  useAudioPlayerState: () => mockState,
}));

// Server action
const mockGetQueueEpisodeScores = vi.fn();
vi.mock("@/app/actions/queue-scores", () => ({
  getQueueEpisodeScores: (...args: unknown[]) =>
    mockGetQueueEpisodeScores(...args),
}));

// Realtime hook — controlled per test
const mockUseRealtimeRun = vi.fn();
vi.mock("@trigger.dev/react-hooks", () => ({
  useRealtimeRun: (...args: unknown[]) => mockUseRealtimeRun(...args),
}));

// Fetch — use vi.stubGlobal for proper lifecycle management
const mockFetch = vi.fn();

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
    vi.stubGlobal("fetch", mockFetch);
    // Reset state defaults
    mockState.currentEpisode = null;
    mockState.queue = [];
    // Scores: empty by default
    mockGetQueueEpisodeScores.mockResolvedValue({});
    // Realtime: no run by default
    mockUseRealtimeRun.mockReturnValue({ run: null });
    // Fetch: no-op by default
    mockFetch.mockResolvedValue({
      status: 200,
      json: async () => ({}),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  it("renders empty state when queue is empty and no current episode", async () => {
    await renderQueueSection();
    expect(screen.getByText("Your queue is empty")).toBeInTheDocument();
    expect(
      screen.getByText("Add episodes to see them here"),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Queue items
  // -------------------------------------------------------------------------

  it("renders queue items with title and podcast name", async () => {
    mockState.queue = [
      makeEpisode({ id: "1001", title: "Ep 1", podcastTitle: "Pod A" }),
      makeEpisode({ id: "1002", title: "Ep 2", podcastTitle: "Pod B" }),
    ];
    await renderQueueSection();
    expect(screen.getByText("Ep 1")).toBeInTheDocument();
    expect(screen.getByText("Pod A")).toBeInTheDocument();
    expect(screen.getByText("Ep 2")).toBeInTheDocument();
    expect(screen.getByText("Pod B")).toBeInTheDocument();
  });

  it("shows episode count badge", async () => {
    mockState.queue = [
      makeEpisode({ id: "1001" }),
      makeEpisode({ id: "1002" }),
    ];
    await renderQueueSection();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Now Playing
  // -------------------------------------------------------------------------

  it("shows 'Now Playing' indicator for the current episode", async () => {
    mockState.currentEpisode = makeEpisode({
      id: "2001",
      title: "Now Playing Ep",
      podcastTitle: "Current Pod",
    });
    await renderQueueSection();
    expect(screen.getByText("Now Playing")).toBeInTheDocument();
    expect(screen.getByText("Now Playing Ep")).toBeInTheDocument();
  });

  it("includes current episode in the episode count", async () => {
    mockState.currentEpisode = makeEpisode({ id: "2001" });
    mockState.queue = [makeEpisode({ id: "1001" })];
    await renderQueueSection();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Score badges
  // -------------------------------------------------------------------------

  it("displays score badge for episodes with scores", async () => {
    mockState.queue = [makeEpisode({ id: "1001", title: "Scored Ep" })];
    mockGetQueueEpisodeScores.mockResolvedValue({ "1001": 8.5 });
    await renderQueueSection();
    await waitFor(() => {
      expect(screen.getByText("8.5")).toBeInTheDocument();
    });
  });

  it("shows 'Get score' button for episodes without scores", async () => {
    mockState.queue = [makeEpisode({ id: "1001", title: "Unscored Ep" })];
    mockGetQueueEpisodeScores.mockResolvedValue({ "1001": null });
    await renderQueueSection();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /get score/i }),
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Summarization — 200 cached
  // -------------------------------------------------------------------------

  it("shows score badge immediately on 200 cached response (no realtime subscription)", async () => {
    mockState.queue = [makeEpisode({ id: "1001", title: "Cached Ep" })];
    mockGetQueueEpisodeScores.mockResolvedValue({ "1001": null });
    mockFetch.mockResolvedValue({
      status: 200,
      json: async () => ({ worthItScore: 7.2 }),
    });

    await renderQueueSection();

    // Wait for "Get score" button to appear
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /get score/i }),
      ).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /get score/i }));

    await waitFor(() => {
      expect(screen.getByText("7.2")).toBeInTheDocument();
    });
    // No SummarizeTracker rendered — no realtime subscription
    expect(mockUseRealtimeRun).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Summarizing")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Summarization — 202 job triggered
  // -------------------------------------------------------------------------

  it("shows loading spinner on 202 response", async () => {
    mockState.queue = [makeEpisode({ id: "1001" })];
    mockGetQueueEpisodeScores.mockResolvedValue({ "1001": null });
    mockFetch.mockResolvedValue({
      status: 202,
      json: async () => ({
        runId: "run_abc",
        publicAccessToken: "tok_xyz",
        status: "queued",
      }),
    });

    await renderQueueSection();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /get score/i }),
      ).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /get score/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Summarizing")).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Summarization — 429 daily limit
  // -------------------------------------------------------------------------

  it("shows daily limit error toast on 429 with dailyLimit field", async () => {
    const { toast } = await import("sonner");
    mockState.queue = [makeEpisode({ id: "1001" })];
    mockGetQueueEpisodeScores.mockResolvedValue({ "1001": null });
    mockFetch.mockResolvedValue({
      status: 429,
      json: async () => ({
        error: "Daily limit reached",
        dailyLimit: 5,
        retryAfterMs: 86400000,
      }),
    });

    await renderQueueSection();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /get score/i }),
      ).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /get score/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("5 episodes per day"),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Summarization — 429 hourly burst
  // -------------------------------------------------------------------------

  it("shows hourly rate limit error toast on 429 without dailyLimit field", async () => {
    const { toast } = await import("sonner");
    mockState.queue = [makeEpisode({ id: "1001" })];
    mockGetQueueEpisodeScores.mockResolvedValue({ "1001": null });
    mockFetch.mockResolvedValue({
      status: 429,
      json: async () => ({
        error: "Rate limit exceeded",
        retryAfterMs: 3600000,
      }),
    });

    await renderQueueSection();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /get score/i }),
      ).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /get score/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Rate limit exceeded. Please try again later.",
      );
    });
  });

  // -------------------------------------------------------------------------
  // SummarizeTracker lifecycle — COMPLETED
  // -------------------------------------------------------------------------

  it("displays score when SummarizeTracker receives COMPLETED with worthItScore", async () => {
    mockState.queue = [makeEpisode({ id: "1001" })];
    mockGetQueueEpisodeScores.mockResolvedValue({ "1001": null });

    // First click triggers 202 → loading state
    mockFetch.mockResolvedValue({
      status: 202,
      json: async () => ({
        runId: "run_abc",
        publicAccessToken: "tok_xyz",
        status: "queued",
      }),
    });

    // SummarizeTracker will call useRealtimeRun — return COMPLETED run
    mockUseRealtimeRun.mockReturnValue({
      run: {
        status: "COMPLETED",
        output: { worthItScore: 9.1 },
      },
    });

    await renderQueueSection();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /get score/i }),
      ).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /get score/i }));

    await waitFor(() => {
      expect(screen.getByText("9.1")).toBeInTheDocument();
    });
  });

  it("shows error when SummarizeTracker receives COMPLETED without worthItScore", async () => {
    mockState.queue = [makeEpisode({ id: "1001" })];
    mockGetQueueEpisodeScores.mockResolvedValue({ "1001": null });

    mockFetch.mockResolvedValue({
      status: 202,
      json: async () => ({
        runId: "run_abc",
        publicAccessToken: "tok_xyz",
        status: "queued",
      }),
    });

    // COMPLETED but output missing worthItScore
    mockUseRealtimeRun.mockReturnValue({
      run: {
        status: "COMPLETED",
        output: {},
      },
    });

    await renderQueueSection();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /get score/i }),
      ).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /get score/i }));

    // Should show retry button (error state), not a score badge
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /retry/i }),
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // SummarizeTracker lifecycle — FAILED
  // -------------------------------------------------------------------------

  it("shows retry button when SummarizeTracker receives FAILED status", async () => {
    mockState.queue = [makeEpisode({ id: "1001" })];
    mockGetQueueEpisodeScores.mockResolvedValue({ "1001": null });

    mockFetch.mockResolvedValue({
      status: 202,
      json: async () => ({
        runId: "run_abc",
        publicAccessToken: "tok_xyz",
        status: "queued",
      }),
    });

    mockUseRealtimeRun.mockReturnValue({
      run: {
        status: "FAILED",
      },
    });

    await renderQueueSection();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /get score/i }),
      ).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /get score/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /retry/i }),
      ).toBeInTheDocument();
    });
  });
});
