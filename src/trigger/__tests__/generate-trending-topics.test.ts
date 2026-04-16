import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Trigger.dev SDK before imports
vi.mock("@trigger.dev/sdk", () => ({
  schedules: {
    task: vi.fn((config) => config),
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn().mockResolvedValue(undefined);

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  episodes: {
    id: "id",
    title: "title",
    keyTakeaways: "key_takeaways",
    summaryStatus: "summary_status",
    processedAt: "processed_at",
  },
  trendingTopics: { generatedAt: "generated_at" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  desc: vi.fn(),
  and: vi.fn(),
  isNotNull: vi.fn(),
}));

const mockGenerateCompletion = vi.fn();
vi.mock("@/lib/ai", () => ({
  generateCompletion: (...args: unknown[]) => mockGenerateCompletion(...args),
}));

const mockParseJsonResponse = vi.fn();
vi.mock("@/lib/openrouter", () => ({
  parseJsonResponse: (...args: unknown[]) => mockParseJsonResponse(...args),
}));

vi.mock("@/lib/prompts", () => ({
  TRENDING_TOPICS_SYSTEM_PROMPT: "You are a podcast trend analyst.",
  getTrendingTopicsPrompt: vi.fn().mockReturnValue("mock prompt"),
}));

import { generateTrendingTopics } from "@/trigger/generate-trending-topics";

const taskConfig = generateTrendingTopics as unknown as {
  run: () => Promise<{ episodeCount: number; topicCount: number }>;
};

// Helper to set up the db.select chain
function mockDbSelect(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  mockSelect.mockReturnValue(chain);
  return chain;
}

// Helper to set up the db.insert chain
function mockDbInsert() {
  mockInsert.mockReturnValue({ values: mockValues });
}

describe("generate-trending-topics task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbInsert();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13T06:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("stores empty topics when no completed episodes exist in window", async () => {
    mockDbSelect([]);

    const result = await taskConfig.run();

    expect(result).toEqual({ episodeCount: 0, topicCount: 0 });
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        topics: [],
        episodeCount: 0,
      })
    );
    expect(mockGenerateCompletion).not.toHaveBeenCalled();
  });

  it("logs warning when MAX_EPISODES cap is reached", async () => {
    const { logger } = await import("@trigger.dev/sdk");
    const episodeRows = Array.from({ length: 500 }, (_, i) => ({
      id: i + 1,
      title: `Episode ${i + 1}`,
      keyTakeaways: [`Takeaway ${i + 1}`],
    }));
    mockDbSelect(episodeRows);

    mockGenerateCompletion.mockResolvedValue("mock completion");
    mockParseJsonResponse.mockReturnValue({
      topics: [{ name: "T1", description: "D1", episodeCount: 2, episodeIds: [1, 2] }],
    });

    await taskConfig.run();

    expect(logger.warn).toHaveBeenCalledWith(
      "Episode query hit MAX_EPISODES cap; snapshot may be incomplete",
      { cap: 500 }
    );
  });

  it("stores empty topics when all episodes lack takeaways", async () => {
    mockDbSelect([
      { id: 1, title: "Episode 1", keyTakeaways: null },
      { id: 2, title: "Episode 2", keyTakeaways: [] },
    ]);

    const result = await taskConfig.run();

    expect(result).toEqual({ episodeCount: 2, topicCount: 0 });
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        topics: [],
        episodeCount: 2,
      })
    );
    expect(mockGenerateCompletion).not.toHaveBeenCalled();
  });

  it("generates and stores topic clusters for valid episodes", async () => {
    mockDbSelect([
      { id: 1, title: "AI in Healthcare", keyTakeaways: ["AI transforms diagnostics"] },
      { id: 2, title: "Machine Learning 101", keyTakeaways: ["ML basics explained"] },
      { id: 3, title: "Leadership Tips", keyTakeaways: ["Lead with empathy"] },
    ]);

    const mockTopics = [
      {
        name: "AI & Machine Learning",
        description: "Episodes about artificial intelligence",
        episodeCount: 2,
        episodeIds: [1, 2],
      },
      {
        name: "Leadership",
        description: "Episodes about leadership",
        episodeCount: 1,
        episodeIds: [3],
      },
    ];

    mockGenerateCompletion.mockResolvedValue("mock completion");
    mockParseJsonResponse.mockReturnValue({ topics: mockTopics });

    const result = await taskConfig.run();

    expect(result).toEqual({ episodeCount: 3, topicCount: 2 });
    expect(mockGenerateCompletion).toHaveBeenCalledWith([
      { role: "system", content: "You are a podcast trend analyst." },
      { role: "user", content: "mock prompt" },
    ]);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        topics: [
          expect.objectContaining({
            name: "AI & Machine Learning",
            slug: "ai-machine-learning",
          }),
          expect.objectContaining({
            name: "Leadership",
            slug: "leadership",
          }),
        ],
        episodeCount: 3,
      })
    );
  });

  it("stores empty topics when LLM response fails to parse", async () => {
    mockDbSelect([
      { id: 1, title: "Episode 1", keyTakeaways: ["Takeaway 1"] },
    ]);

    mockGenerateCompletion.mockResolvedValue("not valid json");
    mockParseJsonResponse.mockImplementation(() => {
      throw new Error("Invalid JSON");
    });

    const result = await taskConfig.run();

    expect(result).toEqual({ episodeCount: 1, topicCount: 0 });
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ topics: [] })
    );
  });

  it("filters out topics with invalid episode IDs", async () => {
    mockDbSelect([
      { id: 1, title: "Episode 1", keyTakeaways: ["Takeaway 1"] },
      { id: 2, title: "Episode 2", keyTakeaways: ["Takeaway 2"] },
    ]);

    const mockTopics = [
      {
        name: "Valid Topic",
        description: "Has valid IDs",
        episodeCount: 2,
        episodeIds: [1, 2],
      },
      {
        name: "Hallucinated Topic",
        description: "Has invalid IDs",
        episodeCount: 2,
        episodeIds: [999, 888],
      },
    ];

    mockGenerateCompletion.mockResolvedValue("mock completion");
    mockParseJsonResponse.mockReturnValue({ topics: mockTopics });

    const result = await taskConfig.run();

    expect(result).toEqual({ episodeCount: 2, topicCount: 1 });
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        topics: [
          expect.objectContaining({
            name: "Valid Topic",
            episodeIds: [1, 2],
            episodeCount: 2,
            slug: "valid-topic",
          }),
        ],
      })
    );
  });

  it("removes topics with zero valid episodes after ID filtering", async () => {
    mockDbSelect([
      { id: 1, title: "Episode 1", keyTakeaways: ["Takeaway 1"] },
    ]);

    const mockTopics = [
      {
        name: "All Invalid",
        description: "All IDs are hallucinated",
        episodeCount: 3,
        episodeIds: [100, 200, 300],
      },
    ];

    mockGenerateCompletion.mockResolvedValue("mock completion");
    mockParseJsonResponse.mockReturnValue({ topics: mockTopics });

    const result = await taskConfig.run();

    expect(result).toEqual({ episodeCount: 1, topicCount: 0 });
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ topics: [] })
    );
  });

  it("clamps to MAX_TOPICS and sorts by episodeCount descending", async () => {
    const episodeRows = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      title: `Episode ${i + 1}`,
      keyTakeaways: [`Takeaway ${i + 1}`],
    }));
    mockDbSelect(episodeRows);

    // Generate 12 topics (exceeds MAX_TOPICS=8), with varying sizes
    const mockTopics = Array.from({ length: 12 }, (_, i) => ({
      name: `Topic ${i + 1}`,
      description: `Description ${i + 1}`,
      episodeCount: i + 1,
      episodeIds: Array.from({ length: i + 1 }, (_, j) => j + 1),
    }));

    mockGenerateCompletion.mockResolvedValue("mock completion");
    mockParseJsonResponse.mockReturnValue({ topics: mockTopics });

    const result = await taskConfig.run();

    expect(result).toEqual({ episodeCount: 20, topicCount: 8 });
    const storedTopics = mockValues.mock.calls[0][0].topics;
    expect(storedTopics).toHaveLength(8);
    // Sorted descending by episodeCount
    for (let i = 1; i < storedTopics.length; i++) {
      expect(storedTopics[i - 1].episodeCount).toBeGreaterThanOrEqual(
        storedTopics[i].episodeCount
      );
    }
    // The largest topics should be kept (topics 5-12 have episodeCount 5-12)
    expect(storedTopics[0].episodeCount).toBe(12);
    expect(storedTopics[7].episodeCount).toBe(5);
  });

  it("corrects episodeCount to match filtered episodeIds length", async () => {
    mockDbSelect([
      { id: 1, title: "Episode 1", keyTakeaways: ["Takeaway 1"] },
      { id: 2, title: "Episode 2", keyTakeaways: ["Takeaway 2"] },
    ]);

    const mockTopics = [
      {
        name: "Mixed Topic",
        description: "Some valid, some invalid IDs",
        episodeCount: 3,
        episodeIds: [1, 2, 999],
      },
    ];

    mockGenerateCompletion.mockResolvedValue("mock completion");
    mockParseJsonResponse.mockReturnValue({ topics: mockTopics });

    const result = await taskConfig.run();

    expect(result).toEqual({ episodeCount: 2, topicCount: 1 });
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        topics: [
          expect.objectContaining({
            name: "Mixed Topic",
            episodeIds: [1, 2],
            episodeCount: 2,
            slug: "mixed-topic",
          }),
        ],
      })
    );
  });

  it("every persisted topic has a non-empty slug in clamped results", async () => {
    const episodeRows = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      title: `Episode ${i + 1}`,
      keyTakeaways: [`Takeaway ${i + 1}`],
    }));
    mockDbSelect(episodeRows);

    const mockTopics = Array.from({ length: 12 }, (_, i) => ({
      name: `Topic ${i + 1}`,
      description: `Description ${i + 1}`,
      episodeCount: i + 1,
      episodeIds: Array.from({ length: i + 1 }, (_, j) => j + 1),
    }));

    mockGenerateCompletion.mockResolvedValue("mock completion");
    mockParseJsonResponse.mockReturnValue({ topics: mockTopics });

    await taskConfig.run();

    const storedTopics = mockValues.mock.calls[0][0].topics;
    for (const topic of storedTopics) {
      expect(typeof topic.slug).toBe("string");
      expect(topic.slug.length).toBeGreaterThan(0);
    }
  });

  it("disambiguates duplicate slugs deterministically in sort order", async () => {
    mockDbSelect([
      { id: 1, title: "Ep 1", keyTakeaways: ["Takeaway 1"] },
      { id: 2, title: "Ep 2", keyTakeaways: ["Takeaway 2"] },
    ]);

    const mockTopics = [
      {
        name: "AI Models",
        description: "First AI Models topic",
        episodeCount: 2,
        episodeIds: [1, 2],
      },
      {
        name: "AI Models",
        description: "Second AI Models topic",
        episodeCount: 1,
        episodeIds: [2],
      },
    ];

    mockGenerateCompletion.mockResolvedValue("mock completion");
    mockParseJsonResponse.mockReturnValue({ topics: mockTopics });

    await taskConfig.run();

    const storedTopics = mockValues.mock.calls[0][0].topics;
    expect(storedTopics).toHaveLength(2);
    expect(storedTopics[0].slug).toBe("ai-models");
    expect(storedTopics[1].slug).toBe("ai-models-2");
  });

  it("drops topics whose name slugifies to empty", async () => {
    mockDbSelect([
      { id: 1, title: "Ep 1", keyTakeaways: ["Takeaway 1"] },
      { id: 2, title: "Ep 2", keyTakeaways: ["Takeaway 2"] },
      { id: 3, title: "Ep 3", keyTakeaways: ["Takeaway 3"] },
    ]);

    const mockTopics = [
      {
        name: "!!!",
        description: "All punctuation name",
        episodeCount: 1,
        episodeIds: [1],
      },
      {
        name: "Valid",
        description: "A valid topic",
        episodeCount: 2,
        episodeIds: [2, 3],
      },
    ];

    mockGenerateCompletion.mockResolvedValue("mock completion");
    mockParseJsonResponse.mockReturnValue({ topics: mockTopics });

    const result = await taskConfig.run();

    expect(result).toEqual({ episodeCount: 3, topicCount: 1 });
    const storedTopics = mockValues.mock.calls[0][0].topics;
    expect(storedTopics).toHaveLength(1);
    expect(storedTopics[0].slug).toBe("valid");
  });

  it("applies dedupe AFTER sort+slice, not before", async () => {
    const episodeRows = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      title: `Episode ${i + 1}`,
      keyTakeaways: [`Takeaway ${i + 1}`],
    }));
    mockDbSelect(episodeRows);

    // Two topics that share the same slug but differ in episodeCount
    // Lower-ranked (lower episodeCount) gets -2 only if it survives slice
    // We create 9 distinct topics + 2 that collide, total 11 > MAX_TOPICS(8)
    const mockTopics = [
      { name: "A Topic", description: "D", episodeCount: 10, episodeIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
      { name: "B Topic", description: "D", episodeCount: 9, episodeIds: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
      { name: "C Topic", description: "D", episodeCount: 8, episodeIds: [1, 2, 3, 4, 5, 6, 7, 8] },
      { name: "D Topic", description: "D", episodeCount: 7, episodeIds: [1, 2, 3, 4, 5, 6, 7] },
      { name: "E Topic", description: "D", episodeCount: 6, episodeIds: [1, 2, 3, 4, 5, 6] },
      { name: "F Topic", description: "D", episodeCount: 5, episodeIds: [1, 2, 3, 4, 5] },
      // These two share the slug "g-topic" after slugify; higher-count ranks first
      { name: "G Topic", description: "D", episodeCount: 4, episodeIds: [1, 2, 3, 4] },
      { name: "G-Topic", description: "D", episodeCount: 3, episodeIds: [1, 2, 3] },
      // This one won't make the cut (rank 9, beyond MAX_TOPICS=8)
      { name: "H Topic", description: "D", episodeCount: 2, episodeIds: [1, 2] },
    ];

    mockGenerateCompletion.mockResolvedValue("mock completion");
    mockParseJsonResponse.mockReturnValue({ topics: mockTopics });

    await taskConfig.run();

    const storedTopics = mockValues.mock.calls[0][0].topics;
    expect(storedTopics).toHaveLength(8);
    // Find the two colliding topics
    const gTopics = storedTopics.filter((t: { slug: string }) => t.slug.startsWith("g-topic"));
    expect(gTopics).toHaveLength(2);
    // Higher-count gets bare slug; lower-count gets -2
    const sorted = [...gTopics].sort((a: { episodeCount: number }, b: { episodeCount: number }) => b.episodeCount - a.episodeCount);
    expect(sorted[0].slug).toBe("g-topic");
    expect(sorted[1].slug).toBe("g-topic-2");
  });
});
