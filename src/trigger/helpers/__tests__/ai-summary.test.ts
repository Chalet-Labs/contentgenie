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

  describe("topic normalization", () => {
    it("includes valid topics sorted by relevance descending", async () => {
      mockParseJsonResponse.mockReturnValue({
        ...mockSummaryResult,
        topics: [
          { name: "machine learning", relevance: 0.6 },
          { name: "leadership skills", relevance: 0.9 },
          { name: "data science", relevance: 0.75 },
        ],
      });

      const result = await generateEpisodeSummary(mockPodcast, mockEpisode, "transcript text");

      expect(result.topics).toEqual([
        { name: "Leadership Skills", relevance: 0.9 },
        { name: "Data Science", relevance: 0.75 },
        { name: "Machine Learning", relevance: 0.6 },
      ]);
    });

    it("clamps relevance below 0 to 0", async () => {
      mockParseJsonResponse.mockReturnValue({
        ...mockSummaryResult,
        topics: [{ name: "Topic One", relevance: -0.5 }],
      });

      const result = await generateEpisodeSummary(mockPodcast, mockEpisode, "transcript text");

      expect(result.topics).toEqual([{ name: "Topic One", relevance: 0 }]);
    });

    it("clamps relevance above 1 to 1", async () => {
      mockParseJsonResponse.mockReturnValue({
        ...mockSummaryResult,
        topics: [{ name: "Topic One", relevance: 1.5 }],
      });

      const result = await generateEpisodeSummary(mockPodcast, mockEpisode, "transcript text");

      expect(result.topics).toEqual([{ name: "Topic One", relevance: 1 }]);
    });

    it("returns only top 5 topics when more than 5 are provided", async () => {
      mockParseJsonResponse.mockReturnValue({
        ...mockSummaryResult,
        topics: [
          { name: "Topic A", relevance: 0.9 },
          { name: "Topic B", relevance: 0.8 },
          { name: "Topic C", relevance: 0.7 },
          { name: "Topic D", relevance: 0.6 },
          { name: "Topic E", relevance: 0.5 },
          { name: "Topic F", relevance: 0.3 },
        ],
      });

      const result = await generateEpisodeSummary(mockPodcast, mockEpisode, "transcript text");

      expect(result.topics).toHaveLength(5);
      expect(result.topics!.map((t) => t.name)).toEqual([
        "Topic A",
        "Topic B",
        "Topic C",
        "Topic D",
        "Topic E",
      ]);
    });

    it("deduplicates topics after title-case normalization, keeping highest relevance", async () => {
      mockParseJsonResponse.mockReturnValue({
        ...mockSummaryResult,
        topics: [
          { name: "machine learning", relevance: 0.6 },
          { name: "Machine Learning", relevance: 0.85 },
          { name: "MACHINE LEARNING", relevance: 0.4 },
        ],
      });

      const result = await generateEpisodeSummary(mockPodcast, mockEpisode, "transcript text");

      expect(result.topics).toHaveLength(1);
      expect(result.topics![0]).toEqual({ name: "Machine Learning", relevance: 0.85 });
    });

    it("filters out entries missing name", async () => {
      mockParseJsonResponse.mockReturnValue({
        ...mockSummaryResult,
        topics: [
          { relevance: 0.8 },
          { name: "Valid Topic", relevance: 0.7 },
        ],
      });

      const result = await generateEpisodeSummary(mockPodcast, mockEpisode, "transcript text");

      expect(result.topics).toEqual([{ name: "Valid Topic", relevance: 0.7 }]);
    });

    it("filters out entries missing relevance", async () => {
      mockParseJsonResponse.mockReturnValue({
        ...mockSummaryResult,
        topics: [
          { name: "No Relevance Topic" },
          { name: "Valid Topic", relevance: 0.7 },
        ],
      });

      const result = await generateEpisodeSummary(mockPodcast, mockEpisode, "transcript text");

      expect(result.topics).toEqual([{ name: "Valid Topic", relevance: 0.7 }]);
    });

    it("filters out entries with empty name after trim", async () => {
      mockParseJsonResponse.mockReturnValue({
        ...mockSummaryResult,
        topics: [
          { name: "   ", relevance: 0.8 },
          { name: "Valid Topic", relevance: 0.7 },
        ],
      });

      const result = await generateEpisodeSummary(mockPodcast, mockEpisode, "transcript text");

      expect(result.topics).toEqual([{ name: "Valid Topic", relevance: 0.7 }]);
    });

    // Pin test: string relevance is dropped (not coerced). If coercion is added later, this test must change intentionally.
    it("drops entries where relevance is a string (pin test — documents current behavior)", async () => {
      mockParseJsonResponse.mockReturnValue({
        ...mockSummaryResult,
        topics: [
          { name: "String Relevance", relevance: "0.9" },
          { name: "Valid Topic", relevance: 0.7 },
        ],
      });

      const result = await generateEpisodeSummary(mockPodcast, mockEpisode, "transcript text");

      expect(result.topics).toEqual([{ name: "Valid Topic", relevance: 0.7 }]);
    });

    // Pin test: NaN relevance is dropped — typeof NaN === "number" is true, so an explicit isNaN guard is required.
    it("drops entries where relevance is NaN (pin test — guards against DB constraint violation)", async () => {
      mockParseJsonResponse.mockReturnValue({
        ...mockSummaryResult,
        topics: [
          { name: "NaN Relevance", relevance: NaN },
          { name: "Valid Topic", relevance: 0.7 },
        ],
      });

      const result = await generateEpisodeSummary(mockPodcast, mockEpisode, "transcript text");

      expect(result.topics).toEqual([{ name: "Valid Topic", relevance: 0.7 }]);
    });

    it("sets topics to undefined when LLM returns a non-array topics field", async () => {
      mockParseJsonResponse.mockReturnValue({
        ...mockSummaryResult,
        topics: "not an array",
      });

      const result = await generateEpisodeSummary(mockPodcast, mockEpisode, "transcript text");

      expect(result.topics).toBeUndefined();
    });

    it("sets topics to undefined when topics is null", async () => {
      mockParseJsonResponse.mockReturnValue({
        ...mockSummaryResult,
        topics: null,
      });

      const result = await generateEpisodeSummary(mockPodcast, mockEpisode, "transcript text");

      expect(result.topics).toBeUndefined();
    });

    it("normalizes topics even when a custom prompt is used", async () => {
      mockParseJsonResponse.mockReturnValue({
        ...mockSummaryResult,
        topics: [{ name: "custom prompt topic", relevance: 0.8 }],
      });

      const result = await generateEpisodeSummary(
        mockPodcast,
        mockEpisode,
        "transcript text",
        "Custom {{transcript}}"
      );

      expect(result.topics).toEqual([{ name: "Custom Prompt Topic", relevance: 0.8 }]);
    });

    it("returns no topics field on LLM parse failure (fallback path)", async () => {
      mockGenerateCompletion.mockResolvedValue("not valid json {{}}");
      mockParseJsonResponse.mockImplementation(() => {
        throw new Error("JSON parse error");
      });

      const result = await generateEpisodeSummary(mockPodcast, mockEpisode, "transcript text");

      expect(Object.hasOwn(result, "topics")).toBe(false);
    });
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
