import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Trigger.dev SDK before imports
const mockMetadataRootIncrement = vi.fn();
const mockCreateToken = vi.fn();
const mockForToken = vi.fn();
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
  wait: {
    createToken: (...args: unknown[]) => mockCreateToken(...args),
    forToken: (...args: unknown[]) => mockForToken(...args),
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

vi.mock("@/trigger/helpers/transcript", () => ({
  fetchTranscript: vi.fn(),
  extractTranscriptUrl: vi.fn(),
  fetchTranscriptFromUrl: vi.fn(),
}));

vi.mock("@/trigger/helpers/ai-summary", () => ({
  generateEpisodeSummary: vi.fn(),
}));

vi.mock("@/trigger/helpers/database", () => ({
  trackEpisodeRun: vi.fn(),
  persistEpisodeSummary: vi.fn(),
  updateEpisodeStatus: vi.fn(),
}));

vi.mock("@/lib/assemblyai", () => ({
  submitTranscriptionAsync: vi.fn(),
}));

import { getEpisodeById, getPodcastById } from "@/trigger/helpers/podcastindex";
import { fetchTranscript, extractTranscriptUrl, fetchTranscriptFromUrl } from "@/trigger/helpers/transcript";
import { generateEpisodeSummary } from "@/trigger/helpers/ai-summary";
import { trackEpisodeRun, persistEpisodeSummary } from "@/trigger/helpers/database";
import { submitTranscriptionAsync } from "@/lib/assemblyai";
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
    vi.mocked(fetchTranscript).mockResolvedValue("Full transcript text");
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    // The task config is extracted by our mock — call the run function directly
    const result = await taskConfig.run(
      { episodeId: 123 },
      mockCtx
    );

    expect(result).toEqual(mockSummary);
    expect(getEpisodeById).toHaveBeenCalledWith(123);
    expect(getPodcastById).toHaveBeenCalledWith(456);
    expect(fetchTranscript).toHaveBeenCalledWith(mockEpisode);
    expect(generateEpisodeSummary).toHaveBeenCalledWith(
      mockPodcast,
      mockEpisode,
      "Full transcript text"
    );
    expect(persistEpisodeSummary).toHaveBeenCalledWith(
      mockEpisode,
      mockPodcast,
      mockSummary,
      "Full transcript text"
    );
  });

  it("proceeds without transcript when all sources fail", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(fetchTranscript).mockRejectedValue(new Error("Transcript unavailable"));
    vi.mocked(extractTranscriptUrl).mockReturnValue(null);
    mockCreateToken.mockResolvedValue({ id: "token-1", url: "https://hooks.trigger.dev/token/1" });
    vi.mocked(submitTranscriptionAsync).mockRejectedValue(new Error("AssemblyAI unavailable"));
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    const result = await taskConfig.run(
      { episodeId: 123 },
      mockCtx
    );

    expect(result).toEqual(mockSummary);
    expect(submitTranscriptionAsync).toHaveBeenCalled();
    expect(generateEpisodeSummary).toHaveBeenCalledWith(
      mockPodcast,
      mockEpisode,
      undefined
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
    vi.mocked(fetchTranscript).mockResolvedValue(undefined);
    vi.mocked(extractTranscriptUrl).mockReturnValue(null);
    mockCreateToken.mockResolvedValue({ id: "token-1", url: "https://hooks.trigger.dev/token/1" });
    vi.mocked(submitTranscriptionAsync).mockRejectedValue(new Error("AssemblyAI unavailable"));
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    const result = await taskConfig.run(
      { episodeId: 123 },
      mockCtx
    );

    expect(result).toEqual(mockSummary);
    expect(generateEpisodeSummary).toHaveBeenCalledWith(
      undefined,
      mockEpisode,
      undefined
    );
  });

  it("uses cached transcription from database and skips external fetches", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    mockFindFirst.mockResolvedValue({ transcription: "Cached transcript text" });
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    const result = await taskConfig.run(
      { episodeId: 123 },
      mockCtx
    );

    expect(result).toEqual(mockSummary);
    expect(fetchTranscript).not.toHaveBeenCalled();
    expect(submitTranscriptionAsync).not.toHaveBeenCalled();
    expect(generateEpisodeSummary).toHaveBeenCalledWith(
      mockPodcast,
      mockEpisode,
      "Cached transcript text"
    );
  });

  it("falls back to AssemblyAI when PodcastIndex transcript unavailable", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(fetchTranscript).mockResolvedValue(undefined);
    vi.mocked(extractTranscriptUrl).mockReturnValue(null);
    const mockToken = { id: "token-1", url: "https://hooks.trigger.dev/token/1" };
    mockCreateToken.mockResolvedValue(mockToken);
    vi.mocked(submitTranscriptionAsync).mockResolvedValue("transcript-123");
    mockForToken.mockResolvedValue({
      ok: true,
      output: { transcript_id: "transcript-123", status: "completed", text: "AssemblyAI transcript text", error: null },
    });
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    const result = await taskConfig.run(
      { episodeId: 123 },
      mockCtx
    );

    expect(result).toEqual(mockSummary);
    expect(submitTranscriptionAsync).toHaveBeenCalledWith(
      "https://example.com/audio.mp3",
      "https://hooks.trigger.dev/token/1"
    );
    expect(generateEpisodeSummary).toHaveBeenCalledWith(
      mockPodcast,
      mockEpisode,
      "AssemblyAI transcript text"
    );
  });

  it("falls back to AssemblyAI when cached transcription lookup fails", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(fetchTranscript).mockResolvedValue(undefined);
    vi.mocked(extractTranscriptUrl).mockReturnValue(null);
    mockFindFirst.mockRejectedValue(new Error("DB connection lost"));
    const mockToken = { id: "token-1", url: "https://hooks.trigger.dev/token/1" };
    mockCreateToken.mockResolvedValue(mockToken);
    vi.mocked(submitTranscriptionAsync).mockResolvedValue("transcript-789");
    mockForToken.mockResolvedValue({
      ok: true,
      output: { transcript_id: "transcript-789", status: "completed", text: "AssemblyAI fallback text", error: null },
    });
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    const result = await taskConfig.run(
      { episodeId: 123 },
      mockCtx
    );

    expect(result).toEqual(mockSummary);
    expect(mockFindFirst).toHaveBeenCalled();
    expect(submitTranscriptionAsync).toHaveBeenCalled();
    expect(generateEpisodeSummary).toHaveBeenCalledWith(
      mockPodcast,
      mockEpisode,
      "AssemblyAI fallback text"
    );
  });

  it("does not call AssemblyAI when PodcastIndex returns valid transcript", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(fetchTranscript).mockResolvedValue("Valid PodcastIndex transcript");
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    await taskConfig.run({ episodeId: 123 }, mockCtx);

    expect(submitTranscriptionAsync).not.toHaveBeenCalled();
  });

  it("logs transcript source as 'podcastindex' when PodcastIndex provides transcript", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(fetchTranscript).mockResolvedValue("PodcastIndex transcript");
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    await taskConfig.run({ episodeId: 123 }, mockCtx);

    const { logger } = await import("@trigger.dev/sdk");
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      "Transcript acquisition complete",
      expect.objectContaining({ source: "podcastindex" })
    );
  });

  it("logs transcript source as 'cached' when database cache provides transcript", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    mockFindFirst.mockResolvedValue({ transcription: "Cached transcript text" });
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    await taskConfig.run({ episodeId: 123 }, mockCtx);

    const { logger } = await import("@trigger.dev/sdk");
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      "Transcript acquisition complete",
      expect.objectContaining({ source: "cached" })
    );
  });

  it("logs transcript source as 'assemblyai' when AssemblyAI provides transcript", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(fetchTranscript).mockResolvedValue(undefined);
    vi.mocked(extractTranscriptUrl).mockReturnValue(null);
    const mockToken = { id: "token-1", url: "https://hooks.trigger.dev/token/1" };
    mockCreateToken.mockResolvedValue(mockToken);
    vi.mocked(submitTranscriptionAsync).mockResolvedValue("transcript-source-test");
    mockForToken.mockResolvedValue({
      ok: true,
      output: { transcript_id: "transcript-source-test", status: "completed", text: "AssemblyAI transcript text", error: null },
    });
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    await taskConfig.run({ episodeId: 123 }, mockCtx);

    const { logger } = await import("@trigger.dev/sdk");
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      "Transcript acquisition complete",
      expect.objectContaining({ source: "assemblyai" })
    );
  });

  it("logs transcript source as 'none' when no source provides transcript", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(fetchTranscript).mockResolvedValue(undefined);
    vi.mocked(extractTranscriptUrl).mockReturnValue(null);
    mockCreateToken.mockResolvedValue({ id: "token-1", url: "https://hooks.trigger.dev/token/1" });
    vi.mocked(submitTranscriptionAsync).mockRejectedValue(new Error("AssemblyAI unavailable"));
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    await taskConfig.run({ episodeId: 123 }, mockCtx);

    const { logger } = await import("@trigger.dev/sdk");
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      "Transcript acquisition complete",
      expect.objectContaining({ source: "none" })
    );
  });

  it("falls back to PodcastIndex when cached transcription is whitespace-only", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    mockFindFirst.mockResolvedValue({ transcription: "   \n  " });
    vi.mocked(fetchTranscript).mockResolvedValue("PodcastIndex fallback transcript");
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    await taskConfig.run({ episodeId: 123 }, mockCtx);

    expect(fetchTranscript).toHaveBeenCalled();
    expect(submitTranscriptionAsync).not.toHaveBeenCalled();
    const { logger } = await import("@trigger.dev/sdk");
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      "Transcript acquisition complete",
      expect.objectContaining({ source: "podcastindex" })
    );
  });

  it("handles AssemblyAI error status via webhook", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(fetchTranscript).mockResolvedValue(undefined);
    vi.mocked(extractTranscriptUrl).mockReturnValue(null);
    const mockToken = { id: "token-1", url: "https://hooks.trigger.dev/token/1" };
    mockCreateToken.mockResolvedValue(mockToken);
    vi.mocked(submitTranscriptionAsync).mockResolvedValue("transcript-456");
    mockForToken.mockResolvedValue({
      ok: true,
      output: { transcript_id: "transcript-456", status: "error", text: null, error: "Audio processing failed" },
    });
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    const result = await taskConfig.run(
      { episodeId: 123 },
      mockCtx
    );

    expect(result).toEqual(mockSummary);
    expect(generateEpisodeSummary).toHaveBeenCalledWith(
      mockPodcast,
      mockEpisode,
      undefined
    );
  });

  it("uses description URL when PodcastIndex unavailable", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(fetchTranscript).mockResolvedValue(undefined);
    vi.mocked(extractTranscriptUrl).mockReturnValue("https://example.com/transcript.txt");
    vi.mocked(fetchTranscriptFromUrl).mockResolvedValue("Description URL transcript text");
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    const result = await taskConfig.run({ episodeId: 123 }, mockCtx);

    expect(result).toEqual(mockSummary);
    expect(submitTranscriptionAsync).not.toHaveBeenCalled();
    expect(generateEpisodeSummary).toHaveBeenCalledWith(
      mockPodcast,
      mockEpisode,
      "Description URL transcript text"
    );
  });

  it("falls through to AssemblyAI when description URL returns no content", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(fetchTranscript).mockResolvedValue(undefined);
    vi.mocked(extractTranscriptUrl).mockReturnValue("https://example.com/transcript.txt");
    vi.mocked(fetchTranscriptFromUrl).mockResolvedValue(undefined);
    const mockToken = { id: "token-1", url: "https://hooks.trigger.dev/token/1" };
    mockCreateToken.mockResolvedValue(mockToken);
    vi.mocked(submitTranscriptionAsync).mockResolvedValue("transcript-fallback");
    mockForToken.mockResolvedValue({
      ok: true,
      output: { transcript_id: "transcript-fallback", status: "completed", text: "AssemblyAI fallback text", error: null },
    });
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    const result = await taskConfig.run({ episodeId: 123 }, mockCtx);

    expect(result).toEqual(mockSummary);
    expect(submitTranscriptionAsync).toHaveBeenCalled();
    expect(generateEpisodeSummary).toHaveBeenCalledWith(
      mockPodcast,
      mockEpisode,
      "AssemblyAI fallback text"
    );
  });

  it("handles AssemblyAI token timeout gracefully", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(fetchTranscript).mockResolvedValue(undefined);
    vi.mocked(extractTranscriptUrl).mockReturnValue(null);
    const mockToken = { id: "token-1", url: "https://hooks.trigger.dev/token/1" };
    mockCreateToken.mockResolvedValue(mockToken);
    vi.mocked(submitTranscriptionAsync).mockResolvedValue("transcript-timeout");
    mockForToken.mockResolvedValue({ ok: false });
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    const result = await taskConfig.run({ episodeId: 123 }, mockCtx);

    expect(result).toEqual(mockSummary);
    expect(generateEpisodeSummary).toHaveBeenCalledWith(
      mockPodcast,
      mockEpisode,
      undefined
    );
  });

  it("logs transcript source as 'description-url' when description URL provides transcript", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(fetchTranscript).mockResolvedValue(undefined);
    vi.mocked(extractTranscriptUrl).mockReturnValue("https://example.com/transcript.txt");
    vi.mocked(fetchTranscriptFromUrl).mockResolvedValue("Description transcript text");
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    await taskConfig.run({ episodeId: 123 }, mockCtx);

    const { logger } = await import("@trigger.dev/sdk");
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      "Transcript acquisition complete",
      expect.objectContaining({ source: "description-url" })
    );
  });

  it("calls metadata.root.increment('completed', 1) after successful run", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(fetchTranscript).mockResolvedValue("Full transcript text");
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    await taskConfig.run({ episodeId: 123 }, mockCtx);

    expect(mockMetadataRootIncrement).toHaveBeenCalledWith("completed", 1);
  });

  it("calls metadata.root.increment('completed', 1) exactly once per successful run", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(fetchTranscript).mockResolvedValue("Transcript");
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
    // taskConfig.onFailure is called by Trigger.dev when the task permanently fails
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
});
