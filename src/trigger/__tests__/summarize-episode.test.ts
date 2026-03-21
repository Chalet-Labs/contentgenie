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

vi.mock("@/db", () => ({
  db: {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
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

const mockFetchTranscriptTriggerAndWait = vi.fn();
vi.mock("@/trigger/fetch-transcript", () => ({
  fetchTranscriptTask: {
    triggerAndWait: (...args: unknown[]) => mockFetchTranscriptTriggerAndWait(...args),
  },
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

describe("summarize-episode task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirst.mockResolvedValue(null);
    // Default: fetch-transcript returns a transcript
    mockFetchTranscriptTriggerAndWait.mockResolvedValue({
      ok: true,
      output: { transcript: "Full transcript text", source: "podcastindex" },
    });
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
    expect(mockFetchTranscriptTriggerAndWait).toHaveBeenCalledWith({
      episodeId: 123,
      enclosureUrl: mockEpisode.enclosureUrl,
      description: mockEpisode.description,
      transcripts: mockEpisode.transcripts,
    });
    expect(generateEpisodeSummary).toHaveBeenCalledWith(
      mockPodcast,
      mockEpisode,
      "Full transcript text"
    );
    expect(persistEpisodeSummary).toHaveBeenCalledWith(
      mockEpisode,
      mockPodcast,
      mockSummary,
      "Full transcript text",
      "podcastindex",
      undefined,
      null
    );
  });

  it("throws AbortTaskRunError when episode is not found", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: null } as never);

    await expect(
      taskConfig.run({ episodeId: 999 }, mockCtx)
    ).rejects.toThrow("Episode 999 not found");
  });

  it("proceeds without podcast context when fetch fails", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockRejectedValue(new Error("Podcast not found"));
    mockFetchTranscriptTriggerAndWait.mockResolvedValue({
      ok: true,
      output: { transcript: undefined, source: null },
    });
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    const result = await taskConfig.run({ episodeId: 123 }, mockCtx);

    expect(result).toEqual(mockSummary);
    expect(generateEpisodeSummary).toHaveBeenCalledWith(
      undefined,
      mockEpisode,
      undefined
    );
  });

  it("fetch-transcript ok:false path — continues without transcript, does not throw", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    mockFetchTranscriptTriggerAndWait.mockResolvedValue({ ok: false });
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    const result = await taskConfig.run({ episodeId: 123 }, mockCtx);

    expect(result).toEqual(mockSummary);
    expect(generateEpisodeSummary).toHaveBeenCalledWith(
      mockPodcast,
      mockEpisode,
      undefined
    );
    expect(persistEpisodeSummary).toHaveBeenCalledWith(
      mockEpisode,
      mockPodcast,
      mockSummary,
      undefined,
      undefined,
      "failed",
      "fetch-transcript task failed permanently after retries"
    );
  });

  it("passes transcript and source from fetch-transcript to persistEpisodeSummary", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    mockFetchTranscriptTriggerAndWait.mockResolvedValue({
      ok: true,
      output: { transcript: "AssemblyAI text", source: "assemblyai" },
    });
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    await taskConfig.run({ episodeId: 123 }, mockCtx);

    expect(persistEpisodeSummary).toHaveBeenCalledWith(
      mockEpisode,
      mockPodcast,
      mockSummary,
      "AssemblyAI text",
      "assemblyai",
      undefined,
      null
    );
  });

  it("passes undefined source (cache hit) through to persistEpisodeSummary", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    mockFetchTranscriptTriggerAndWait.mockResolvedValue({
      ok: true,
      output: { transcript: "Cached transcript", source: undefined },
    });
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    await taskConfig.run({ episodeId: 123 }, mockCtx);

    // undefined source preserves existing DB value
    expect(persistEpisodeSummary).toHaveBeenCalledWith(
      mockEpisode,
      mockPodcast,
      mockSummary,
      "Cached transcript",
      undefined,
      undefined,
      null
    );
  });

  it("calls updateEpisodeStatus('summarizing') after fetch-transcript completes", async () => {
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

  it("calls metadata.root.increment('failed', 1) in onFailure", async () => {
    await taskConfig.onFailure({ payload: { episodeId: 42 } });

    expect(mockMetadataRootIncrement).toHaveBeenCalledWith("failed", 1);
  });

  it("calls metadata.root.increment('failed', 1) even when DB update in onFailure fails", async () => {
    const { db } = await import("@/db");
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error("DB unavailable")),
      }),
    } as never);

    await taskConfig.onFailure({ payload: { episodeId: 42 } });

    expect(mockMetadataRootIncrement).toHaveBeenCalledWith("failed", 1);
  });

  it("isNewEpisode=false skips new_episode notification on re-summarization", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);
    // Enter the notification branch
    vi.mocked(resolvePodcastId).mockResolvedValue(99);
    // First call: prior summary check (existing summary → re-summarization)
    // Second call: episodeDbId lookup for notifications
    mockFindFirst
      .mockResolvedValueOnce({ summary: "Existing summary" })
      .mockResolvedValueOnce({ id: 42 });

    const result = await taskConfig.run({ episodeId: 123 }, mockCtx);

    expect(result).toEqual(mockSummary);
    // new_episode should NOT be sent on re-summarization
    const newEpisodeCalls = vi.mocked(createNotificationsForSubscribers).mock.calls
      .filter(([, , type]) => type === "new_episode");
    expect(newEpisodeCalls).toHaveLength(0);
    // summary_completed should still be sent
    expect(createNotificationsForSubscribers).toHaveBeenCalledWith(
      99,
      42,
      "summary_completed",
      mockPodcast.title,
      `Summary ready: ${mockEpisode.title}`
    );
  });
});
