import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateCompletion = vi.fn();
const mockParseJsonResponse = vi.fn();
const mockGetSummarizationPrompt = vi.fn();
const mockInterpolatePrompt = vi.fn();

vi.mock("@/lib/ai", () => ({
  generateCompletion: (...args: unknown[]) => mockGenerateCompletion(...args),
}));

vi.mock("@/lib/openrouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/openrouter")>();
  return {
    ...actual,
    parseJsonResponse: (...args: unknown[]) => mockParseJsonResponse(...args),
  };
});

vi.mock("@/lib/prompts", () => ({
  SYSTEM_PROMPT: "system prompt",
  getSummarizationPrompt: (...args: unknown[]) =>
    mockGetSummarizationPrompt(...args),
}));

vi.mock("@/lib/admin/prompt-utils", () => ({
  interpolatePrompt: (...args: unknown[]) => mockInterpolatePrompt(...args),
}));

import { generateEpisodeSummary } from "@/trigger/helpers/ai-summary";
import type {
  PodcastIndexEpisode,
  PodcastIndexPodcast,
} from "@/lib/podcastindex";

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

const mockSignalResult = {
  summary: "Test summary",
  keyTakeaways: ["Takeaway 1"],
  worthItReason: "Good episode",
  worthItSignals: {
    hasActionableInsights: true,
    hasNearTermApplicability: true,
    staysFocused: true,
    goesBeyondSurface: true,
    isWellStructured: true,
    timeJustified: false,
    hasConcreteExamples: false,
    hasExpertPerspectives: false,
  },
  worthItAdjustment: 0,
  worthItAdjustmentReason: "Signals capture quality accurately.",
};

const mockLegacyDimensionResult = {
  summary: "Test summary",
  keyTakeaways: ["Takeaway 1"],
  worthItScore: 7,
  worthItReason: "Good episode",
  worthItDimensions: { uniqueness: 7, actionability: 7, timeValue: 7 },
};

// Default to signal-based result (matches current default prompt)
const mockSummaryResult = mockSignalResult;

describe("generateEpisodeSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateCompletion.mockResolvedValue('{"summary":"Test summary"}');
    mockParseJsonResponse.mockReturnValue(mockSummaryResult);
    mockGetSummarizationPrompt.mockReturnValue("default prompt");
    mockInterpolatePrompt.mockReturnValue("interpolated prompt");
  });

  describe("topic normalization", () => {
    /** Shorthand: mock topics from LLM, run summarization, return result */
    async function summarizeWithTopics(topics: unknown) {
      mockParseJsonResponse.mockReturnValue({ ...mockSummaryResult, topics });
      return generateEpisodeSummary(
        mockPodcast,
        mockEpisode,
        "transcript text",
      );
    }

    it("includes valid topics sorted by relevance descending", async () => {
      const result = await summarizeWithTopics([
        { name: "machine learning", relevance: 0.6 },
        { name: "leadership skills", relevance: 0.9 },
        { name: "data science", relevance: 0.75 },
      ]);

      expect(result.topics).toEqual([
        { name: "Leadership Skills", relevance: 0.9 },
        { name: "Data Science", relevance: 0.75 },
        { name: "Machine Learning", relevance: 0.6 },
      ]);
    });

    it("clamps relevance below 0 to 0", async () => {
      const result = await summarizeWithTopics([
        { name: "Topic One", relevance: -0.5 },
      ]);
      expect(result.topics).toEqual([{ name: "Topic One", relevance: 0 }]);
    });

    it("clamps relevance above 1 to 1", async () => {
      const result = await summarizeWithTopics([
        { name: "Topic One", relevance: 1.5 },
      ]);
      expect(result.topics).toEqual([{ name: "Topic One", relevance: 1 }]);
    });

    it("returns only top 5 topics when more than 5 are provided", async () => {
      const result = await summarizeWithTopics([
        { name: "Topic A", relevance: 0.9 },
        { name: "Topic B", relevance: 0.8 },
        { name: "Topic C", relevance: 0.7 },
        { name: "Topic D", relevance: 0.6 },
        { name: "Topic E", relevance: 0.5 },
        { name: "Topic F", relevance: 0.3 },
      ]);

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
      const result = await summarizeWithTopics([
        { name: "machine learning", relevance: 0.6 },
        { name: "Machine Learning", relevance: 0.85 },
        { name: "MACHINE LEARNING", relevance: 0.4 },
      ]);

      expect(result.topics).toHaveLength(1);
      expect(result.topics![0]).toEqual({
        name: "Machine Learning",
        relevance: 0.85,
      });
    });

    it("filters out entries with name exceeding 100 characters", async () => {
      const result = await summarizeWithTopics([
        { name: "A".repeat(101), relevance: 0.9 },
        { name: "Valid Topic", relevance: 0.7 },
      ]);
      expect(result.topics).toEqual([{ name: "Valid Topic", relevance: 0.7 }]);
    });

    it("filters out entries missing name", async () => {
      const result = await summarizeWithTopics([
        { relevance: 0.8 },
        { name: "Valid Topic", relevance: 0.7 },
      ]);
      expect(result.topics).toEqual([{ name: "Valid Topic", relevance: 0.7 }]);
    });

    it("filters out entries missing relevance", async () => {
      const result = await summarizeWithTopics([
        { name: "No Relevance Topic" },
        { name: "Valid Topic", relevance: 0.7 },
      ]);
      expect(result.topics).toEqual([{ name: "Valid Topic", relevance: 0.7 }]);
    });

    it("filters out entries with empty name after trim", async () => {
      const result = await summarizeWithTopics([
        { name: "   ", relevance: 0.8 },
        { name: "Valid Topic", relevance: 0.7 },
      ]);
      expect(result.topics).toEqual([{ name: "Valid Topic", relevance: 0.7 }]);
    });

    // Pin test: string relevance is dropped (not coerced). If coercion is added later, this test must change intentionally.
    it("drops entries where relevance is a string (pin test — documents current behavior)", async () => {
      const result = await summarizeWithTopics([
        { name: "String Relevance", relevance: "0.9" },
        { name: "Valid Topic", relevance: 0.7 },
      ]);
      expect(result.topics).toEqual([{ name: "Valid Topic", relevance: 0.7 }]);
    });

    // Pin test: NaN relevance is dropped — typeof NaN === "number" is true, so an explicit isNaN guard is required.
    it("drops entries where relevance is NaN (pin test — guards against DB constraint violation)", async () => {
      const result = await summarizeWithTopics([
        { name: "NaN Relevance", relevance: NaN },
        { name: "Valid Topic", relevance: 0.7 },
      ]);
      expect(result.topics).toEqual([{ name: "Valid Topic", relevance: 0.7 }]);
    });

    it("sets topics to undefined when LLM returns a non-array topics field", async () => {
      const result = await summarizeWithTopics("not an array");
      expect(result.topics).toBeUndefined();
    });

    it("sets topics to undefined when topics is null", async () => {
      const result = await summarizeWithTopics(null);
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
        "Custom {{transcript}}",
      );

      expect(result.topics).toEqual([
        { name: "Custom Prompt Topic", relevance: 0.8 },
      ]);
    });

    it("returns no topics field on LLM parse failure (fallback path)", async () => {
      mockGenerateCompletion.mockResolvedValue("not valid json {{}}");
      mockParseJsonResponse.mockImplementation(() => {
        throw new Error("JSON parse error");
      });

      const result = await generateEpisodeSummary(
        mockPodcast,
        mockEpisode,
        "transcript text",
      );

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
      "transcript text",
    );
    expect(mockInterpolatePrompt).not.toHaveBeenCalled();
  });

  it("uses default prompt when customPrompt is null", async () => {
    await generateEpisodeSummary(
      mockPodcast,
      mockEpisode,
      "transcript text",
      null,
    );

    expect(mockGetSummarizationPrompt).toHaveBeenCalled();
    expect(mockInterpolatePrompt).not.toHaveBeenCalled();
  });

  it("uses default prompt when customPrompt is undefined", async () => {
    await generateEpisodeSummary(
      mockPodcast,
      mockEpisode,
      "transcript text",
      undefined,
    );

    expect(mockGetSummarizationPrompt).toHaveBeenCalled();
    expect(mockInterpolatePrompt).not.toHaveBeenCalled();
  });

  it("uses interpolatePrompt when customPrompt is provided", async () => {
    const customPrompt = "Analyze {{transcript}} for {{title}}";
    await generateEpisodeSummary(
      mockPodcast,
      mockEpisode,
      "transcript text",
      customPrompt,
    );

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

    await generateEpisodeSummary(
      mockPodcast,
      mockEpisode,
      "transcript text",
      customPrompt,
    );

    expect(mockGenerateCompletion).toHaveBeenCalledWith([
      { role: "system", content: "system prompt" },
      { role: "user", content: "Custom transcript text" },
    ]);
  });

  it("falls back to 'Unknown Podcast' when podcast is undefined", async () => {
    await generateEpisodeSummary(
      undefined,
      mockEpisode,
      "transcript text",
      null,
    );

    expect(mockGetSummarizationPrompt).toHaveBeenCalledWith(
      "Unknown Podcast",
      expect.any(String),
      expect.any(String),
      expect.any(Number),
      expect.any(String),
    );
  });

  describe("signal score computation", () => {
    it("computes score as 1 + trueCount + adjustment from signals", async () => {
      mockParseJsonResponse.mockReturnValue({ ...mockSignalResult });
      const result = await generateEpisodeSummary(
        mockPodcast,
        mockEpisode,
        "transcript text",
      );

      // 5 true signals → base 6, adj 0 → score 6
      expect(result.worthItScore).toBe(6);
    });

    it("stores worthItDimensions with kind 'signals'", async () => {
      mockParseJsonResponse.mockReturnValue({ ...mockSignalResult });
      const result = await generateEpisodeSummary(
        mockPodcast,
        mockEpisode,
        "transcript text",
      );

      expect(result.worthItDimensions).toEqual(
        expect.objectContaining({ kind: "signals" }),
      );
    });

    it("includes signal summary in worthItReason", async () => {
      mockParseJsonResponse.mockReturnValue({ ...mockSignalResult });
      const result = await generateEpisodeSummary(
        mockPodcast,
        mockEpisode,
        "transcript text",
      );

      expect(result.worthItReason).toContain("5/8 signals");
    });

    it("carries the editorial-focused SIGNAL_LABELS wording into worthItReason", async () => {
      // staysFocused=true in mockSignalResult, so its label flows through the fired-signal summary.
      mockParseJsonResponse.mockReturnValue({ ...mockSignalResult });
      const result = await generateEpisodeSummary(
        mockPodcast,
        mockEpisode,
        "transcript text",
      );

      expect(result.worthItReason).toMatch(/editorial/i);
    });

    it("coerces non-boolean signal values via toSignalBoolean", async () => {
      mockParseJsonResponse.mockReturnValue({
        ...mockSignalResult,
        worthItSignals: {
          hasActionableInsights: 1, // number 1 → true
          hasNearTermApplicability: "true", // string "true" → true
          staysFocused: 0, // number 0 → false
          goesBeyondSurface: "", // unrecognized → false
          isWellStructured: true, // boolean → true
          timeJustified: false, // boolean → false
          hasConcreteExamples: null, // null → false
          hasExpertPerspectives: undefined, // undefined → false
        },
      });

      const result = await generateEpisodeSummary(
        mockPodcast,
        mockEpisode,
        "transcript text",
      );

      // True: 1, "true", true → 3 true signals. base=4, adj=0 → score 4
      expect(result.worthItScore).toBe(4);
    });

    it("logs console.warn for each non-boolean signal value", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockParseJsonResponse.mockReturnValue({
        ...mockSignalResult,
        worthItSignals: {
          hasActionableInsights: 1,
          hasNearTermApplicability: true,
          staysFocused: true,
          goesBeyondSurface: true,
          isWellStructured: true,
          timeJustified: true,
          hasConcreteExamples: true,
          hasExpertPerspectives: true,
        },
      });

      await generateEpisodeSummary(mockPodcast, mockEpisode, "transcript text");

      const signalWarns = warnSpy.mock.calls.filter(
        (args) =>
          typeof args[0] === "string" &&
          args[0].includes("non-boolean signal coerced"),
      );
      expect(signalWarns).toHaveLength(1);
      expect(signalWarns[0][0]).toContain("hasActionableInsights");
      warnSpy.mockRestore();
    });

    it("does not log console.warn for missing signal keys", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockParseJsonResponse.mockReturnValue({
        ...mockSignalResult,
        worthItSignals: {
          hasActionableInsights: true,
          // All other keys missing — should NOT warn
        },
      });

      await generateEpisodeSummary(mockPodcast, mockEpisode, "transcript text");

      const signalWarns = warnSpy.mock.calls.filter(
        (args) =>
          typeof args[0] === "string" &&
          args[0].includes("non-boolean signal coerced"),
      );
      expect(signalWarns).toHaveLength(0);
      warnSpy.mockRestore();
    });

    it("does not log console.warn when all signals are booleans", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockParseJsonResponse.mockReturnValue({ ...mockSignalResult });

      await generateEpisodeSummary(mockPodcast, mockEpisode, "transcript text");

      const signalWarns = warnSpy.mock.calls.filter(
        (args) =>
          typeof args[0] === "string" &&
          args[0].includes("non-boolean signal coerced"),
      );
      expect(signalWarns).toHaveLength(0);
      warnSpy.mockRestore();
    });

    it("clamps adjustment outside [-1,1]", async () => {
      mockParseJsonResponse.mockReturnValue({
        ...mockSignalResult,
        worthItAdjustment: 5,
      });
      const result = await generateEpisodeSummary(
        mockPodcast,
        mockEpisode,
        "transcript text",
      );

      // 5 true signals → base 6, adj clamped to 1 → score 7
      expect(result.worthItScore).toBe(7);
    });

    it("defaults missing adjustment to 0", async () => {
      const { worthItAdjustment: _, ...withoutAdj } = mockSignalResult;
      mockParseJsonResponse.mockReturnValue(withoutAdj);
      const result = await generateEpisodeSummary(
        mockPodcast,
        mockEpisode,
        "transcript text",
      );

      // 5 true → base 6, adj 0 → score 6
      expect(result.worthItScore).toBe(6);
    });

    it("defaults missing adjustmentReason to empty string", async () => {
      const { worthItAdjustmentReason: _, ...withoutReason } = mockSignalResult;
      mockParseJsonResponse.mockReturnValue(withoutReason);
      const result = await generateEpisodeSummary(
        mockPodcast,
        mockEpisode,
        "transcript text",
      );

      expect(result.worthItDimensions).toEqual(
        expect.objectContaining({ adjustmentReason: "" }),
      );
    });
  });

  describe("legacy dimension scoring (custom prompts)", () => {
    it("averages dimensions when LLM returns old format", async () => {
      mockParseJsonResponse.mockReturnValue({ ...mockLegacyDimensionResult });
      const result = await generateEpisodeSummary(
        mockPodcast,
        mockEpisode,
        "transcript text",
        "custom prompt",
      );

      expect(result.worthItScore).toBe(7);
      expect(result.worthItDimensions).toEqual(
        expect.objectContaining({ kind: "dimensions" }),
      );
    });

    it("uses raw LLM score when neither signals nor dimensions present", async () => {
      mockParseJsonResponse.mockReturnValue({
        summary: "Test",
        keyTakeaways: ["one"],
        worthItScore: 8.5,
        worthItReason: "custom reason",
      });
      const result = await generateEpisodeSummary(
        mockPodcast,
        mockEpisode,
        "transcript text",
        "custom prompt",
      );

      expect(result.worthItScore).toBe(8.5);
    });

    it("defaults worthItScore to 5 when neither format nor raw score present", async () => {
      mockParseJsonResponse.mockReturnValue({
        summary: "Test",
        keyTakeaways: ["one"],
        worthItReason: "custom reason",
      });
      const result = await generateEpisodeSummary(
        mockPodcast,
        mockEpisode,
        "transcript text",
        "custom prompt",
      );

      expect(result.worthItScore).toBe(5);
    });
  });
});
