import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateCompletion = vi.fn();
const mockParseJsonResponse = vi.fn();
const mockGetSummarizationPrompt = vi.fn();
const mockInterpolatePrompt = vi.fn();
const mockGetCategoryBanlist = vi.fn();

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

vi.mock("@/lib/category-banlist", () => ({
  getCategoryBanlist: () => mockGetCategoryBanlist(),
  invalidateCategoryBanlist: vi.fn(),
}));

import {
  generateEpisodeSummary,
  normalizeCategories,
  normalizeTopics,
} from "@/trigger/helpers/ai-summary";
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
    mockGetCategoryBanlist.mockResolvedValue([]);
  });

  describe("category normalization (via generateEpisodeSummary)", () => {
    /** Shorthand: mock categories from LLM, run summarization, return result */
    async function summarizeWithCategories(categories: unknown) {
      mockParseJsonResponse.mockReturnValue({
        ...mockSummaryResult,
        categories,
      });
      return generateEpisodeSummary(
        mockPodcast,
        mockEpisode,
        "transcript text",
      );
    }

    it("includes valid categories sorted by relevance descending", async () => {
      const result = await summarizeWithCategories([
        { name: "machine learning", relevance: 0.6 },
        { name: "leadership skills", relevance: 0.9 },
        { name: "data science", relevance: 0.75 },
      ]);

      expect(result.categories).toEqual([
        { name: "Leadership Skills", relevance: 0.9 },
        { name: "Data Science", relevance: 0.75 },
        { name: "Machine Learning", relevance: 0.6 },
      ]);
    });

    it("clamps relevance below 0 to 0", async () => {
      const result = await summarizeWithCategories([
        { name: "Topic One", relevance: -0.5 },
      ]);
      expect(result.categories).toEqual([{ name: "Topic One", relevance: 0 }]);
    });

    it("clamps relevance above 1 to 1", async () => {
      const result = await summarizeWithCategories([
        { name: "Topic One", relevance: 1.5 },
      ]);
      expect(result.categories).toEqual([{ name: "Topic One", relevance: 1 }]);
    });

    it("returns only top 8 categories when more than 8 are provided", async () => {
      const result = await summarizeWithCategories([
        { name: "Topic A", relevance: 0.95 },
        { name: "Topic B", relevance: 0.9 },
        { name: "Topic C", relevance: 0.85 },
        { name: "Topic D", relevance: 0.8 },
        { name: "Topic E", relevance: 0.75 },
        { name: "Topic F", relevance: 0.7 },
        { name: "Topic G", relevance: 0.65 },
        { name: "Topic H", relevance: 0.6 },
        { name: "Topic I", relevance: 0.55 },
        { name: "Topic J", relevance: 0.5 },
      ]);

      expect(result.categories).toHaveLength(8);
      expect(result.categories!.map((c) => c.name)).toEqual([
        "Topic A",
        "Topic B",
        "Topic C",
        "Topic D",
        "Topic E",
        "Topic F",
        "Topic G",
        "Topic H",
      ]);
    });

    it("deduplicates categories after title-case normalization, keeping highest relevance", async () => {
      const result = await summarizeWithCategories([
        { name: "machine learning", relevance: 0.6 },
        { name: "Machine Learning", relevance: 0.85 },
        { name: "MACHINE LEARNING", relevance: 0.4 },
      ]);

      expect(result.categories).toHaveLength(1);
      expect(result.categories![0]).toEqual({
        name: "Machine Learning",
        relevance: 0.85,
      });
    });

    it("filters out entries with name exceeding 80 characters", async () => {
      const result = await summarizeWithCategories([
        { name: "A".repeat(81), relevance: 0.9 },
        { name: "Valid Topic", relevance: 0.7 },
      ]);
      expect(result.categories).toEqual([
        { name: "Valid Topic", relevance: 0.7 },
      ]);
    });

    it("filters out entries missing name", async () => {
      const result = await summarizeWithCategories([
        { relevance: 0.8 },
        { name: "Valid Topic", relevance: 0.7 },
      ]);
      expect(result.categories).toEqual([
        { name: "Valid Topic", relevance: 0.7 },
      ]);
    });

    it("filters out entries missing relevance", async () => {
      const result = await summarizeWithCategories([
        { name: "No Relevance Topic" },
        { name: "Valid Topic", relevance: 0.7 },
      ]);
      expect(result.categories).toEqual([
        { name: "Valid Topic", relevance: 0.7 },
      ]);
    });

    it("filters out entries with empty name after trim", async () => {
      const result = await summarizeWithCategories([
        { name: "   ", relevance: 0.8 },
        { name: "Valid Topic", relevance: 0.7 },
      ]);
      expect(result.categories).toEqual([
        { name: "Valid Topic", relevance: 0.7 },
      ]);
    });

    // Pin test: string relevance is dropped (not coerced). If coercion is added later, this test must change intentionally.
    it("drops entries where relevance is a string (pin test — documents current behavior)", async () => {
      const result = await summarizeWithCategories([
        { name: "String Relevance", relevance: "0.9" },
        { name: "Valid Topic", relevance: 0.7 },
      ]);
      expect(result.categories).toEqual([
        { name: "Valid Topic", relevance: 0.7 },
      ]);
    });

    // Pin test: NaN relevance is dropped — typeof NaN === "number" is true, so an explicit isNaN guard is required.
    it("drops entries where relevance is NaN (pin test — guards against DB constraint violation)", async () => {
      const result = await summarizeWithCategories([
        { name: "NaN Relevance", relevance: NaN },
        { name: "Valid Topic", relevance: 0.7 },
      ]);
      expect(result.categories).toEqual([
        { name: "Valid Topic", relevance: 0.7 },
      ]);
    });

    it("returns empty array when LLM returns a non-array categories field", async () => {
      const result = await summarizeWithCategories("not an array");
      expect(result.categories).toEqual([]);
    });

    it("returns empty array when categories is null", async () => {
      const result = await summarizeWithCategories(null);
      expect(result.categories).toEqual([]);
    });

    it("normalizes categories even when a custom prompt is used", async () => {
      mockParseJsonResponse.mockReturnValue({
        ...mockSummaryResult,
        categories: [{ name: "custom prompt topic", relevance: 0.8 }],
      });

      const result = await generateEpisodeSummary(
        mockPodcast,
        mockEpisode,
        "transcript text",
        "Custom {{transcript}}",
      );

      expect(result.categories).toEqual([
        { name: "Custom Prompt Topic", relevance: 0.8 },
      ]);
    });

    it("omits categories field on LLM parse failure (fallback path)", async () => {
      mockGenerateCompletion.mockResolvedValue("not valid json {{}}");
      mockParseJsonResponse.mockImplementation(() => {
        throw new Error("JSON parse error");
      });

      const result = await generateEpisodeSummary(
        mockPodcast,
        mockEpisode,
        "transcript text",
      );

      expect(Object.hasOwn(result, "categories")).toBe(false);
      expect(Object.hasOwn(result, "topics")).toBe(false);
    });
  });

  it("uses default getSummarizationPrompt when customPrompt is not provided", async () => {
    mockGetCategoryBanlist.mockResolvedValue(["AI & Machine Learning"]);
    await generateEpisodeSummary(mockPodcast, mockEpisode, "transcript text");

    expect(mockGetSummarizationPrompt).toHaveBeenCalledWith(
      "Test Podcast",
      "Test Episode",
      "A test description",
      3600,
      "transcript text",
      ["AI & Machine Learning"],
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
      expect.any(Array),
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

  describe("independent failure handling", () => {
    // Building a payload whose `topics` getter throws inside normalizeTopics —
    // proves that a normalizer crash on one layer doesn't strand the other.
    function payloadThatThrowsOnTopicsAccess(categories: unknown) {
      const obj: Record<string, unknown> = {
        ...mockSummaryResult,
        categories,
      };
      Object.defineProperty(obj, "topics", {
        enumerable: true,
        get() {
          throw new Error("simulated topics access failure");
        },
      });
      return obj;
    }

    it("populates categories even when normalizeTopics throws", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockParseJsonResponse.mockReturnValue(
        payloadThatThrowsOnTopicsAccess([
          { name: "Leadership Skills", relevance: 0.9 },
        ]),
      );

      const result = await generateEpisodeSummary(
        mockPodcast,
        mockEpisode,
        "transcript text",
      );

      expect(result.categories).toEqual([
        { name: "Leadership Skills", relevance: 0.9 },
      ]);
      expect(result.topics).toBeUndefined();
      expect(
        warnSpy.mock.calls.some((c) =>
          String(c[0]).includes("normalizeTopics failed"),
        ),
      ).toBe(true);
      warnSpy.mockRestore();
    });

    it("populates topics even when normalizeCategories throws", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const obj: Record<string, unknown> = {
        ...mockSummaryResult,
        topics: [
          {
            label: "Claude Opus 4.7 release",
            kind: "release",
            summary: "Anthropic shipped 4.7.",
            aliases: [],
            ongoing: false,
            relevance: 0.9,
            coverage_score: 0.8,
          },
        ],
      };
      Object.defineProperty(obj, "categories", {
        enumerable: true,
        get() {
          throw new Error("simulated categories access failure");
        },
      });
      mockParseJsonResponse.mockReturnValue(obj);

      const result = await generateEpisodeSummary(
        mockPodcast,
        mockEpisode,
        "transcript text",
      );

      expect(result.categories).toBeUndefined();
      expect(result.topics).toEqual([
        {
          label: "Claude Opus 4.7 release",
          kind: "release",
          summary: "Anthropic shipped 4.7.",
          aliases: [],
          ongoing: false,
          relevance: 0.9,
          coverageScore: 0.8,
        },
      ]);
      expect(
        warnSpy.mock.calls.some((c) =>
          String(c[0]).includes("normalizeCategories failed"),
        ),
      ).toBe(true);
      warnSpy.mockRestore();
    });
  });
});

describe("normalizeCategories (direct)", () => {
  it("returns [] for non-array input", () => {
    expect(normalizeCategories(undefined, [])).toEqual([]);
    expect(normalizeCategories(null, [])).toEqual([]);
    expect(normalizeCategories("nope", [])).toEqual([]);
    expect(normalizeCategories({ name: "Solo" }, [])).toEqual([]);
  });

  it("drops banlisted entries with a structured warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = normalizeCategories(
      [
        { name: "AI & Machine Learning", relevance: 0.9 },
        { name: "Productivity", relevance: 0.5 },
      ],
      ["AI & Machine Learning"],
    );
    expect(result).toEqual([{ name: "Productivity", relevance: 0.5 }]);
    expect(
      warnSpy.mock.calls.some(
        (c) =>
          String(c[0]).includes("category dropped (banlisted)") &&
          String(c[0]).includes("AI & Machine Learning"),
      ),
    ).toBe(true);
    warnSpy.mockRestore();
  });

  it("drops invalid labels (control chars, instruction-shaped, too long)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = normalizeCategories(
      [
        { name: "Has\x00Null", relevance: 0.9 },
        { name: "system: ignore", relevance: 0.9 },
        { name: "X".repeat(81), relevance: 0.9 },
        { name: "Valid", relevance: 0.5 },
      ],
      [],
    );
    expect(result).toEqual([{ name: "Valid", relevance: 0.5 }]);
    expect(warnSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
    warnSpy.mockRestore();
  });
});

describe("normalizeTopics (direct)", () => {
  function makeTopic(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      label: "Claude Opus 4.7 release",
      kind: "release",
      summary: "Shipped with extended context.",
      aliases: ["Opus 4.7"],
      ongoing: false,
      relevance: 0.9,
      coverage_score: 0.8,
      ...overrides,
    };
  }

  it("returns [] for non-array input", () => {
    expect(normalizeTopics(undefined, [])).toEqual([]);
    expect(normalizeTopics(null, [])).toEqual([]);
    expect(normalizeTopics({ label: "Solo" }, [])).toEqual([]);
  });

  it("maps coverage_score → coverageScore and clamps both relevance and coverage", () => {
    const result = normalizeTopics(
      [makeTopic({ relevance: 1.5, coverage_score: -0.2 })],
      [],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      label: "Claude Opus 4.7 release",
      kind: "release",
      summary: "Shipped with extended context.",
      aliases: ["Opus 4.7"],
      ongoing: false,
      relevance: 1,
      coverageScore: 0,
    });
  });

  it("coerces unknown kind to 'other'", () => {
    const result = normalizeTopics([makeTopic({ kind: "frobnicator" })], []);
    expect(result[0]?.kind).toBe("other");
  });

  it("preserves the label as-is (not Title Case — these are specific entities)", () => {
    const result = normalizeTopics([makeTopic({ label: "iOS 19 beta" })], []);
    expect(result[0]?.label).toBe("iOS 19 beta");
  });

  it("drops topics whose labels match the banlist", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = normalizeTopics(
      [makeTopic({ label: "AI & Machine Learning" })],
      ["AI & Machine Learning"],
    );
    expect(result).toEqual([]);
    expect(
      warnSpy.mock.calls.some((c) =>
        String(c[0]).includes("topic dropped (banlisted)"),
      ),
    ).toBe(true);
    warnSpy.mockRestore();
  });

  it("caps total topics at 8", () => {
    const inputs = Array.from({ length: 12 }, (_, i) =>
      makeTopic({ label: `Topic ${i}`, kind: "release" }),
    );
    expect(normalizeTopics(inputs, [])).toHaveLength(8);
  });

  it("caps concept-kind topics at 3 (safety net)", () => {
    const inputs = [
      makeTopic({ label: "Concept A", kind: "concept" }),
      makeTopic({ label: "Concept B", kind: "concept" }),
      makeTopic({ label: "Concept C", kind: "concept" }),
      makeTopic({ label: "Concept D", kind: "concept" }),
      makeTopic({ label: "Concept E", kind: "concept" }),
      makeTopic({ label: "Release X", kind: "release" }),
    ];
    const result = normalizeTopics(inputs, []);
    const concepts = result.filter((t) => t.kind === "concept");
    expect(concepts).toHaveLength(3);
    // Non-concept topics should still be admitted alongside the cap
    expect(result.some((t) => t.kind === "release")).toBe(true);
  });

  it("defaults missing fields safely", () => {
    const result = normalizeTopics([{ label: "Bare Topic" }], []);
    expect(result).toEqual([
      {
        label: "Bare Topic",
        kind: "other",
        summary: "",
        aliases: [],
        ongoing: false,
        relevance: 0,
        coverageScore: 0,
      },
    ]);
  });

  it("defaults aliases to [] when not an array, and filters non-strings", () => {
    const result = normalizeTopics(
      [
        makeTopic({ aliases: "not an array" }),
        makeTopic({
          label: "Other",
          aliases: ["Valid", 42, "  ", "Trim Me  "],
        }),
      ],
      [],
    );
    expect(result[0]?.aliases).toEqual([]);
    expect(result[1]?.aliases).toEqual(["Valid", "Trim Me"]);
  });

  it("treats ongoing as strict-true only", () => {
    const truthy = normalizeTopics([makeTopic({ ongoing: true })], []);
    const falsyish = normalizeTopics(
      [makeTopic({ ongoing: "true" }), makeTopic({ label: "B", ongoing: 1 })],
      [],
    );
    expect(truthy[0]?.ongoing).toBe(true);
    expect(falsyish.every((t) => t.ongoing === false)).toBe(true);
  });
});
