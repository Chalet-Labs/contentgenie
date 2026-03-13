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
        topics: mockTopics,
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
          }),
        ],
      })
    );
  });
});
