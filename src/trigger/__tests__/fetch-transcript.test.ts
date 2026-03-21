import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Trigger.dev SDK before imports
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
  },
  wait: {
    createToken: (...args: unknown[]) => mockCreateToken(...args),
    forToken: (...args: unknown[]) => mockForToken(...args),
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

const mockFetchTranscript = vi.fn();
const mockExtractTranscriptUrl = vi.fn();
const mockFetchTranscriptFromUrl = vi.fn();
vi.mock("@/trigger/helpers/transcript", () => ({
  fetchTranscript: (...args: unknown[]) => mockFetchTranscript(...args),
  extractTranscriptUrl: (...args: unknown[]) => mockExtractTranscriptUrl(...args),
  fetchTranscriptFromUrl: (...args: unknown[]) => mockFetchTranscriptFromUrl(...args),
}));

const mockPersistTranscript = vi.fn();
vi.mock("@/trigger/helpers/database", () => ({
  persistTranscript: (...args: unknown[]) => mockPersistTranscript(...args),
}));

vi.mock("@/lib/assemblyai", () => ({
  submitTranscriptionAsync: vi.fn(),
  getTranscriptionStatus: vi.fn(),
}));

import { fetchTranscriptTask } from "@/trigger/fetch-transcript";
import { submitTranscriptionAsync, getTranscriptionStatus } from "@/lib/assemblyai";

// The task mock returns the raw config object, so `.run` is available at runtime
const taskConfig = fetchTranscriptTask as unknown as {
  run: (payload: {
    episodeId: number;
    enclosureUrl?: string;
    description?: string;
    transcripts?: Array<{ url: string; type: string }>;
    force?: boolean;
  }) => Promise<{ transcript: string | undefined; source: string | null | undefined }>;
};

const mockTranscripts = [{ url: "https://example.com/transcript.txt", type: "text/plain" }];

describe("fetch-transcript task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirst.mockResolvedValue(null);
    mockPersistTranscript.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("cache hit with force=false returns cached transcript, source undefined, no external fetches", async () => {
    mockFindFirst.mockResolvedValue({ transcription: "Cached transcript text" });

    const result = await taskConfig.run({ episodeId: 123, transcripts: mockTranscripts });

    expect(result).toEqual({ transcript: "Cached transcript text", source: undefined });
    expect(mockFetchTranscript).not.toHaveBeenCalled();
    expect(vi.mocked(submitTranscriptionAsync)).not.toHaveBeenCalled();
    expect(mockPersistTranscript).not.toHaveBeenCalled();
  });

  it("cache hit with force=true ignores cache and proceeds to PodcastIndex waterfall", async () => {
    mockFindFirst.mockResolvedValue({ transcription: "Cached transcript text" });
    mockFetchTranscript.mockResolvedValue("PodcastIndex transcript");

    const result = await taskConfig.run({
      episodeId: 123,
      transcripts: mockTranscripts,
      force: true,
    });

    expect(result).toEqual({ transcript: "PodcastIndex transcript", source: "podcastindex" });
    expect(mockFetchTranscript).toHaveBeenCalled();
    expect(mockPersistTranscript).toHaveBeenCalledWith(123, "PodcastIndex transcript", "podcastindex");
  });

  it("PodcastIndex transcript found returns correct result and calls persistTranscript", async () => {
    mockFetchTranscript.mockResolvedValue("PodcastIndex transcript text");

    const result = await taskConfig.run({ episodeId: 123, transcripts: mockTranscripts });

    expect(result).toEqual({ transcript: "PodcastIndex transcript text", source: "podcastindex" });
    expect(mockPersistTranscript).toHaveBeenCalledWith(123, "PodcastIndex transcript text", "podcastindex");
  });

  it("description URL fallback when PodcastIndex returns nothing", async () => {
    mockFetchTranscript.mockResolvedValue(undefined);
    mockExtractTranscriptUrl.mockReturnValue("https://example.com/transcript.txt");
    mockFetchTranscriptFromUrl.mockResolvedValue("Description URL transcript");

    const result = await taskConfig.run({
      episodeId: 123,
      transcripts: [],
      description: "See transcript at https://example.com/transcript.txt",
    });

    expect(result).toEqual({ transcript: "Description URL transcript", source: "description-url" });
    expect(mockPersistTranscript).toHaveBeenCalledWith(123, "Description URL transcript", "description-url");
    expect(vi.mocked(submitTranscriptionAsync)).not.toHaveBeenCalled();
  });

  it("AssemblyAI fallback when PodcastIndex and description URL both fail", async () => {
    mockFetchTranscript.mockResolvedValue(undefined);
    mockExtractTranscriptUrl.mockReturnValue(null);
    const mockToken = { id: "token-1", url: "https://hooks.trigger.dev/token/1" };
    mockCreateToken.mockResolvedValue(mockToken);
    vi.mocked(submitTranscriptionAsync).mockResolvedValue("transcript-abc");
    mockForToken.mockResolvedValue({
      ok: true,
      output: { transcript_id: "transcript-abc", status: "completed" },
    });
    vi.mocked(getTranscriptionStatus).mockResolvedValue({
      id: "transcript-abc", status: "completed", text: "AssemblyAI transcript", error: null,
    });

    const result = await taskConfig.run({
      episodeId: 123,
      transcripts: [],
      enclosureUrl: "https://example.com/audio.mp3",
    });

    expect(result).toEqual({ transcript: "AssemblyAI transcript", source: "assemblyai" });
    expect(mockPersistTranscript).toHaveBeenCalledWith(123, "AssemblyAI transcript", "assemblyai");
  });

  it("all sources fail returns transcript: undefined, source: null, no persistTranscript call", async () => {
    mockFetchTranscript.mockResolvedValue(undefined);
    mockExtractTranscriptUrl.mockReturnValue(null);
    mockCreateToken.mockResolvedValue({ id: "token-1", url: "https://hooks.trigger.dev/token/1" });
    vi.mocked(submitTranscriptionAsync).mockRejectedValue(new Error("AssemblyAI unavailable"));

    const result = await taskConfig.run({
      episodeId: 123,
      transcripts: [],
      enclosureUrl: "https://example.com/audio.mp3",
    });

    expect(result).toEqual({ transcript: undefined, source: null });
    expect(mockPersistTranscript).not.toHaveBeenCalled();
  });

  it("AssemblyAI token timeout returns transcript: undefined, source: null", async () => {
    mockFetchTranscript.mockResolvedValue(undefined);
    mockExtractTranscriptUrl.mockReturnValue(null);
    mockCreateToken.mockResolvedValue({ id: "token-1", url: "https://hooks.trigger.dev/token/1" });
    vi.mocked(submitTranscriptionAsync).mockResolvedValue("transcript-timeout");
    mockForToken.mockResolvedValue({ ok: false });

    const result = await taskConfig.run({
      episodeId: 123,
      transcripts: [],
      enclosureUrl: "https://example.com/audio.mp3",
    });

    expect(result).toEqual({ transcript: undefined, source: null });
    expect(mockPersistTranscript).not.toHaveBeenCalled();
  });

  it("AssemblyAI error status returns transcript: undefined, source: null", async () => {
    mockFetchTranscript.mockResolvedValue(undefined);
    mockExtractTranscriptUrl.mockReturnValue(null);
    mockCreateToken.mockResolvedValue({ id: "token-1", url: "https://hooks.trigger.dev/token/1" });
    vi.mocked(submitTranscriptionAsync).mockResolvedValue("transcript-err");
    mockForToken.mockResolvedValue({
      ok: true,
      output: { transcript_id: "transcript-err", status: "error" },
    });
    vi.mocked(getTranscriptionStatus).mockResolvedValue({
      id: "transcript-err", status: "error", text: null, error: "Audio processing failed",
    });

    const result = await taskConfig.run({
      episodeId: 123,
      transcripts: [],
      enclosureUrl: "https://example.com/audio.mp3",
    });

    expect(result).toEqual({ transcript: undefined, source: null });
    expect(mockPersistTranscript).not.toHaveBeenCalled();
  });

  it("persistTranscript failure is non-fatal — task still returns transcript", async () => {
    mockFetchTranscript.mockResolvedValue("PodcastIndex transcript");
    mockPersistTranscript.mockRejectedValue(new Error("DB unavailable"));

    const result = await taskConfig.run({ episodeId: 123, transcripts: mockTranscripts });

    expect(result).toEqual({ transcript: "PodcastIndex transcript", source: "podcastindex" });
    expect(mockPersistTranscript).toHaveBeenCalled();
  });

  it("whitespace-only cached transcript treated as cache miss, falls through to waterfall", async () => {
    mockFindFirst.mockResolvedValue({ transcription: "   \n  " });
    mockFetchTranscript.mockResolvedValue("PodcastIndex fallback transcript");

    const result = await taskConfig.run({ episodeId: 123, transcripts: mockTranscripts });

    expect(result).toEqual({ transcript: "PodcastIndex fallback transcript", source: "podcastindex" });
    expect(mockFetchTranscript).toHaveBeenCalled();
  });

  it("no enclosureUrl skips AssemblyAI entirely", async () => {
    mockFetchTranscript.mockResolvedValue(undefined);
    mockExtractTranscriptUrl.mockReturnValue(null);

    const result = await taskConfig.run({ episodeId: 123, transcripts: [] });

    expect(result).toEqual({ transcript: undefined, source: null });
    expect(vi.mocked(submitTranscriptionAsync)).not.toHaveBeenCalled();
    expect(mockCreateToken).not.toHaveBeenCalled();
  });
});
