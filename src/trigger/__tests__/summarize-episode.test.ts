import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Trigger.dev SDK before imports
const mockMetadataRootIncrement = vi.fn();
vi.mock("@trigger.dev/sdk", () => ({
  task: vi.fn((config) => config),
  retry: {
    onThrow: vi.fn(async (fn) => fn()),
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  metadata: {
    set: vi.fn(),
    root: {
      increment: (...args: unknown[]) => mockMetadataRootIncrement(...args),
    },
  },
  AbortTaskRunError: class AbortTaskRunError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AbortTaskRunError";
    }
  },
}));

const mockFindFirst = vi.fn().mockResolvedValue(null);
const mockUpdate = vi.fn();

vi.mock("@/db", () => ({
  db: {
    update: (...args: unknown[]) => mockUpdate(...args),
    query: {
      episodes: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
    },
  },
}));

vi.mock("@/db/schema", () => ({
  episodes: { podcastIndexId: "podcastIndexId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("@/trigger/helpers/podcastindex", () => ({
  getEpisodeById: vi.fn(),
  getPodcastById: vi.fn(),
}));

vi.mock("@/trigger/helpers/ai-summary", () => ({
  generateEpisodeSummary: vi.fn(),
}));

vi.mock("@/trigger/helpers/database", () => ({
  trackEpisodeRun: vi.fn(),
  persistEpisodeSummary: vi.fn(),
  updateEpisodeStatus: vi.fn(),
}));

vi.mock("@/trigger/helpers/notifications", () => ({
  createNotificationsForSubscribers: vi.fn(),
  resolvePodcastId: vi.fn(),
}));

vi.mock("@/lib/ai/config", () => ({
  getActiveAiConfig: vi.fn().mockResolvedValue({
    provider: "openrouter",
    model: "google/gemini-2.0-flash-001",
    summarizationPrompt: null,
  }),
}));

import { getEpisodeById, getPodcastById } from "@/trigger/helpers/podcastindex";
import { generateEpisodeSummary } from "@/trigger/helpers/ai-summary";
import { persistEpisodeSummary, updateEpisodeStatus } from "@/trigger/helpers/database";
import { createNotificationsForSubscribers, resolvePodcastId } from "@/trigger/helpers/notifications";
import { summarizeEpisode } from "@/trigger/summarize-episode";

// The task mock returns the raw config object, so `.run` and `.onFailure` are available at runtime
const taskConfig = summarizeEpisode as unknown as {
  run: (payload: { episodeId: number }, ctx: unknown) => Promise<unknown>;
  onFailure: (params: { payload: { episodeId: number } }) => Promise<void>;
};

const mockCtx = { run: { id: "run_test123" } } as never;

const mockEpisode = {
  id: 123,
  title: "Test Episode",
  description: "A test episode",
  feedId: 456,
  duration: 3600,
  enclosureUrl: "https://example.com/audio.mp3",
  transcripts: [{ url: "https://example.com/transcript.txt", type: "text/plain" }],
};

const mockPodcast = {
  title: "Test Podcast",
  description: "A test podcast",
  author: "Test Author",
};

const mockSummary = {
  summary: "This is a test summary",
  keyTakeaways: ["Takeaway 1", "Takeaway 2"],
  worthItScore: 7.5,
  worthItReason: "Good content",
};

function makeUpdateChain(resolvedValue: unknown = undefined) {
  const whereFn = vi.fn().mockResolvedValue(resolvedValue);
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  mockUpdate.mockReturnValue({ set: setFn });
  return { setFn, whereFn };
}

describe("summarize-episode task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: episode has a transcript in the DB
    mockFindFirst.mockResolvedValue({ transcription: "Full transcript text" });
    makeUpdateChain();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("completes the full pipeline successfully", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    const result = await taskConfig.run({ episodeId: 123 }, mockCtx);

    expect(result).toEqual(mockSummary);
    expect(getEpisodeById).toHaveBeenCalledWith(123);
    expect(getPodcastById).toHaveBeenCalledWith(456);
    expect(generateEpisodeSummary).toHaveBeenCalledWith(
      mockPodcast,
      mockEpisode,
      "Full transcript text",
      null
    );
    expect(persistEpisodeSummary).toHaveBeenCalledWith(
      mockEpisode,
      mockPodcast,
      mockSummary
    );
  });

  it("reads transcript from DB (does not call fetch-transcript)", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    await taskConfig.run({ episodeId: 123 }, mockCtx);

    // Transcript comes from findFirst (DB read), not from any external task
    expect(mockFindFirst).toHaveBeenCalled();
    expect(generateEpisodeSummary).toHaveBeenCalledWith(
      mockPodcast,
      mockEpisode,
      "Full transcript text",
      null
    );
  });

  it("throws AbortTaskRunError when episode is not found", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: null } as never);

    await expect(
      taskConfig.run({ episodeId: 999 }, mockCtx)
    ).rejects.toThrow("Episode 999 not found");
  });

  it("aborts when transcript is missing — writes failed status to DB before throwing", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    mockFindFirst.mockResolvedValue(null);
    const { setFn } = makeUpdateChain();

    await expect(
      taskConfig.run({ episodeId: 123 }, mockCtx)
    ).rejects.toThrow("has no transcript available");

    // DB write must happen before the abort
    expect(mockUpdate).toHaveBeenCalled();
    const setArgs = setFn.mock.calls[0][0];
    expect(setArgs.summaryStatus).toBe("failed");
    expect(setArgs.summaryRunId).toBeNull();
    expect(setArgs.processingError).toContain("123");
    expect(setArgs.processingError).toContain("fetch-transcript");
  });

  it("aborts when transcript is whitespace-only — writes failed status to DB before throwing", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    mockFindFirst.mockResolvedValue({ transcription: "   \n  " });
    const { setFn } = makeUpdateChain();

    await expect(
      taskConfig.run({ episodeId: 123 }, mockCtx)
    ).rejects.toThrow("has no transcript available");

    expect(setFn.mock.calls[0][0].summaryStatus).toBe("failed");
  });

  it("aborts when transcript is missing even if DB write fails", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    mockFindFirst.mockResolvedValue(null);
    const whereFn = vi.fn().mockRejectedValue(new Error("DB unavailable"));
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    mockUpdate.mockReturnValue({ set: setFn });

    // AbortTaskRunError must still be thrown even though the DB write fails
    await expect(
      taskConfig.run({ episodeId: 123 }, mockCtx)
    ).rejects.toThrow("has no transcript available");
  });

  it("proceeds without podcast context when fetch fails", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockRejectedValue(new Error("Podcast not found"));
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    const result = await taskConfig.run({ episodeId: 123 }, mockCtx);

    expect(result).toEqual(mockSummary);
    expect(generateEpisodeSummary).toHaveBeenCalledWith(
      undefined,
      mockEpisode,
      "Full transcript text",
      null
    );
  });

  it("calls updateEpisodeStatus('summarizing') before generating summary", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    await taskConfig.run({ episodeId: 123 }, mockCtx);

    expect(vi.mocked(updateEpisodeStatus)).toHaveBeenCalledWith(123, "summarizing");
  });

  it("calls metadata.root.increment('completed', 1) after successful run", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    await taskConfig.run({ episodeId: 123 }, mockCtx);

    expect(mockMetadataRootIncrement).toHaveBeenCalledWith("completed", 1);
  });

  it("calls metadata.root.increment('completed', 1) exactly once per successful run", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    await taskConfig.run({ episodeId: 123 }, mockCtx);

    const completedCalls = mockMetadataRootIncrement.mock.calls.filter(
      ([key]) => key === "completed"
    );
    expect(completedCalls).toHaveLength(1);
    expect(completedCalls[0]).toEqual(["completed", 1]);
  });

  it("does not call metadata.root.increment('completed') when episode is not found", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: null } as never);

    await expect(
      taskConfig.run({ episodeId: 999 }, mockCtx)
    ).rejects.toThrow("Episode 999 not found");

    const completedCalls = mockMetadataRootIncrement.mock.calls.filter(
      ([key]) => key === "completed"
    );
    expect(completedCalls).toHaveLength(0);
  });

  it("onFailure preserves existing processingError instead of overwriting", async () => {
    mockFindFirst.mockResolvedValueOnce({
      processingError: "Episode 42 has no transcript available — run fetch-transcript first",
    });
    const { setFn } = makeUpdateChain();

    await taskConfig.onFailure({ payload: { episodeId: 42 } });

    const setArgs = setFn.mock.calls[0][0];
    expect(setArgs.processingError).toBe(
      "Episode 42 has no transcript available — run fetch-transcript first"
    );
    expect(setArgs.summaryStatus).toBe("failed");
  });

  it("onFailure uses generic message when no prior processingError exists", async () => {
    mockFindFirst.mockResolvedValueOnce({ processingError: null });
    const { setFn } = makeUpdateChain();

    await taskConfig.onFailure({ payload: { episodeId: 42 } });

    const setArgs = setFn.mock.calls[0][0];
    expect(setArgs.processingError).toBe(
      "Summarization failed after maximum retry attempts"
    );
  });

  it("onFailure still writes failed status when processingError lookup throws", async () => {
    mockFindFirst.mockRejectedValueOnce(new Error("DB read failed"));
    const { setFn } = makeUpdateChain();

    await taskConfig.onFailure({ payload: { episodeId: 42 } });

    // Update must still run with generic fallback
    expect(mockUpdate).toHaveBeenCalled();
    const setArgs = setFn.mock.calls[0][0];
    expect(setArgs.summaryStatus).toBe("failed");
    expect(setArgs.processingError).toBe(
      "Summarization failed after maximum retry attempts"
    );
  });

  it("calls metadata.root.increment('failed', 1) in onFailure", async () => {
    await taskConfig.onFailure({ payload: { episodeId: 42 } });

    expect(mockMetadataRootIncrement).toHaveBeenCalledWith("failed", 1);
  });

  it("calls metadata.root.increment('failed', 1) even when DB update in onFailure fails", async () => {
    const whereFn = vi.fn().mockRejectedValue(new Error("DB unavailable"));
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    mockUpdate.mockReturnValue({ set: setFn });

    await taskConfig.onFailure({ payload: { episodeId: 42 } });

    expect(mockMetadataRootIncrement).toHaveBeenCalledWith("failed", 1);
  });

  it("isNewEpisode=true sends both new_episode and summary_completed notifications", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);
    vi.mocked(resolvePodcastId).mockResolvedValue(99);
    // Calls in order:
    // 1. transcript + summary read (no prior summary → first-time)
    // 2. episodeDbId lookup for notifications
    mockFindFirst
      .mockResolvedValueOnce({ transcription: "Full transcript text" })
      .mockResolvedValueOnce({ id: 42 });

    await taskConfig.run({ episodeId: 123 }, mockCtx);

    expect(createNotificationsForSubscribers).toHaveBeenCalledWith(
      99,
      42,
      "new_episode",
      mockPodcast.title,
      `New episode: ${mockEpisode.title}`
    );
    expect(createNotificationsForSubscribers).toHaveBeenCalledWith(
      99,
      42,
      "summary_completed",
      mockPodcast.title,
      `Summary ready: ${mockEpisode.title}`
    );
    expect(createNotificationsForSubscribers).toHaveBeenCalledTimes(2);
  });

  it("isNewEpisode=false skips new_episode notification on re-summarization", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);
    vi.mocked(resolvePodcastId).mockResolvedValue(99);
    // Calls in order:
    // 1. transcript + summary read (existing summary → re-summarization)
    // 2. episodeDbId lookup for notifications
    mockFindFirst
      .mockResolvedValueOnce({ transcription: "Full transcript text", summary: "Existing summary" })
      .mockResolvedValueOnce({ id: 42 });

    const result = await taskConfig.run({ episodeId: 123 }, mockCtx);

    expect(result).toEqual(mockSummary);
    const newEpisodeCalls = vi.mocked(createNotificationsForSubscribers).mock.calls
      .filter(([, , type]) => type === "new_episode");
    expect(newEpisodeCalls).toHaveLength(0);
    expect(createNotificationsForSubscribers).toHaveBeenCalledWith(
      99,
      42,
      "summary_completed",
      mockPodcast.title,
      `Summary ready: ${mockEpisode.title}`
    );
  });
});
