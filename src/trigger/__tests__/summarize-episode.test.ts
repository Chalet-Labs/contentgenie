import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Trigger.dev SDK before imports
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
  AbortTaskRunError: class AbortTaskRunError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AbortTaskRunError";
    }
  },
}));

vi.mock("@/trigger/helpers/podcastindex", () => ({
  getEpisodeById: vi.fn(),
  getPodcastById: vi.fn(),
}));

vi.mock("@/trigger/helpers/transcript", () => ({
  fetchTranscript: vi.fn(),
}));

vi.mock("@/trigger/helpers/openrouter", () => ({
  generateEpisodeSummary: vi.fn(),
}));

vi.mock("@/trigger/helpers/database", () => ({
  persistEpisodeSummary: vi.fn(),
}));

import { getEpisodeById, getPodcastById } from "@/trigger/helpers/podcastindex";
import { fetchTranscript } from "@/trigger/helpers/transcript";
import { generateEpisodeSummary } from "@/trigger/helpers/openrouter";
import { persistEpisodeSummary } from "@/trigger/helpers/database";
import { summarizeEpisode } from "@/trigger/summarize-episode";

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
  });

  it("completes the full pipeline successfully", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(fetchTranscript).mockResolvedValue("Full transcript text");
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    // The task config is extracted by our mock — call the run function directly
    const result = await summarizeEpisode.run(
      { episodeId: 123 },
      {} as never
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

  it("proceeds without transcript when fetch fails", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockResolvedValue({ feed: mockPodcast } as never);
    vi.mocked(fetchTranscript).mockRejectedValue(new Error("Transcript unavailable"));
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    const result = await summarizeEpisode.run(
      { episodeId: 123 },
      {} as never
    );

    expect(result).toEqual(mockSummary);
    expect(generateEpisodeSummary).toHaveBeenCalledWith(
      mockPodcast,
      mockEpisode,
      undefined
    );
  });

  it("throws AbortTaskRunError when episode is not found", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: null } as never);

    await expect(
      summarizeEpisode.run({ episodeId: 999 }, {} as never)
    ).rejects.toThrow("Episode 999 not found");
  });

  it("proceeds without podcast context when fetch fails", async () => {
    vi.mocked(getEpisodeById).mockResolvedValue({ episode: mockEpisode } as never);
    vi.mocked(getPodcastById).mockRejectedValue(new Error("Podcast not found"));
    vi.mocked(fetchTranscript).mockResolvedValue(undefined);
    vi.mocked(generateEpisodeSummary).mockResolvedValue(mockSummary);
    vi.mocked(persistEpisodeSummary).mockResolvedValue(undefined);

    const result = await summarizeEpisode.run(
      { episodeId: 123 },
      {} as never
    );

    expect(result).toEqual(mockSummary);
    expect(generateEpisodeSummary).toHaveBeenCalledWith(
      undefined,
      mockEpisode,
      undefined
    );
  });
});
