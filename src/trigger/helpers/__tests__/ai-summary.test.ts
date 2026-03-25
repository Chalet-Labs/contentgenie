import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateCompletion = vi.fn();
const mockParseJsonResponse = vi.fn();
const mockGetSummarizationPrompt = vi.fn();
const mockInterpolatePrompt = vi.fn();

vi.mock("@/lib/ai", () => ({
  generateCompletion: (...args: unknown[]) => mockGenerateCompletion(...args),
}));

vi.mock("@/lib/openrouter", () => ({
  parseJsonResponse: (...args: unknown[]) => mockParseJsonResponse(...args),
}));

vi.mock("@/lib/prompts", () => ({
  SYSTEM_PROMPT: "system prompt",
  getSummarizationPrompt: (...args: unknown[]) => mockGetSummarizationPrompt(...args),
}));

vi.mock("@/lib/admin/prompt-utils", () => ({
  interpolatePrompt: (...args: unknown[]) => mockInterpolatePrompt(...args),
}));

import { generateEpisodeSummary } from "@/trigger/helpers/ai-summary";
import type { PodcastIndexEpisode, PodcastIndexPodcast } from "@/lib/podcastindex";

const mockEpisode = {
  id: 1,
  feedId: 100,
  title: "Test Episode",
  description: "A test description",
  duration: 3600,
  enclosureUrl: "https://example.com/audio.mp3",
} as PodcastIndexEpisode;

const mockPodcast = {
  id: 100,
  title: "Test Podcast",
  author: "",
  description: "",
} as PodcastIndexPodcast;

const mockSummaryResult = {
  summary: "Test summary",
  keyTakeaways: ["Takeaway 1"],
  worthItScore: 7,
  worthItReason: "Good episode",
  worthItDimensions: { uniqueness: 7, actionability: 7, timeValue: 7 },
};

describe("generateEpisodeSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateCompletion.mockResolvedValue('{"summary":"Test summary"}');
    mockParseJsonResponse.mockReturnValue(mockSummaryResult);
    mockGetSummarizationPrompt.mockReturnValue("default prompt");
    mockInterpolatePrompt.mockReturnValue("interpolated prompt");
  });

  it("uses default getSummarizationPrompt when customPrompt is not provided", async () => {
    await generateEpisodeSummary(mockPodcast, mockEpisode, "transcript text");

    expect(mockGetSummarizationPrompt).toHaveBeenCalledWith(
      "Test Podcast",
      "Test Episode",
      "A test description",
      3600,
      "transcript text"
    );
    expect(mockInterpolatePrompt).not.toHaveBeenCalled();
  });

  it("uses default prompt when customPrompt is null", async () => {
    await generateEpisodeSummary(mockPodcast, mockEpisode, "transcript text", null);

    expect(mockGetSummarizationPrompt).toHaveBeenCalled();
    expect(mockInterpolatePrompt).not.toHaveBeenCalled();
  });

  it("uses default prompt when customPrompt is undefined", async () => {
    await generateEpisodeSummary(mockPodcast, mockEpisode, "transcript text", undefined);

    expect(mockGetSummarizationPrompt).toHaveBeenCalled();
    expect(mockInterpolatePrompt).not.toHaveBeenCalled();
  });

  it("uses interpolatePrompt when customPrompt is provided", async () => {
    const customPrompt = "Analyze {{transcript}} for {{title}}";
    await generateEpisodeSummary(mockPodcast, mockEpisode, "transcript text", customPrompt);

    expect(mockInterpolatePrompt).toHaveBeenCalledWith(customPrompt, {
      title: "Test Episode",
      podcastName: "Test Podcast",
      description: "A test description",
      duration: 3600,
      transcript: "transcript text",
    });
    expect(mockGetSummarizationPrompt).not.toHaveBeenCalled();
  });

  it("passes interpolated prompt as user turn to generateCompletion", async () => {
    const customPrompt = "Custom {{transcript}}";
    mockInterpolatePrompt.mockReturnValue("Custom transcript text");

    await generateEpisodeSummary(mockPodcast, mockEpisode, "transcript text", customPrompt);

    expect(mockGenerateCompletion).toHaveBeenCalledWith([
      { role: "system", content: "system prompt" },
      { role: "user", content: "Custom transcript text" },
    ]);
  });

  it("falls back to 'Unknown Podcast' when podcast is undefined", async () => {
    await generateEpisodeSummary(undefined, mockEpisode, "transcript text", null);

    expect(mockGetSummarizationPrompt).toHaveBeenCalledWith(
      "Unknown Podcast",
      expect.any(String),
      expect.any(String),
      expect.any(Number),
      expect.any(String)
    );
  });
});
