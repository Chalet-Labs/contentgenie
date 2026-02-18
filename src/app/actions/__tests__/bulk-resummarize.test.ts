import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Clerk auth
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

// Mock next/cache (needed by some server actions indirectly)
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock database
const mockDbSelect = vi.fn();
vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

// Mock schema — stub table references used in the WHERE clause builder
vi.mock("@/db/schema", () => ({
  episodes: {
    processedAt: "processed_at",
    podcastId: "podcast_id",
    publishDate: "publish_date",
    worthItScore: "worth_it_score",
  },
}));

// Mock drizzle-orm operators
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ type: "and", conditions: args })),
  isNotNull: vi.fn((col: unknown) => ({ type: "isNotNull", col })),
  lte: vi.fn((col: unknown, val: unknown) => ({ type: "lte", col, val })),
  gte: vi.fn((col: unknown, val: unknown) => ({ type: "gte", col, val })),
  eq: vi.fn((col: unknown, val: unknown) => ({ type: "eq", col, val })),
  count: vi.fn(() => "count(*)"),
}));

// Helper to set up db.select().from().where() chain returning a count
function mockCountResult(countValue: number) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ count: countValue }]),
    }),
  });
}

describe("getResummarizeEpisodeCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockCountResult(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns error when user is not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { getResummarizeEpisodeCount } = await import(
      "@/app/actions/bulk-resummarize"
    );
    const result = await getResummarizeEpisodeCount({});

    expect(result.count).toBe(0);
    expect(result.error).toMatch(/signed in/i);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("returns count with no filters applied", async () => {
    mockCountResult(42);

    const { getResummarizeEpisodeCount } = await import(
      "@/app/actions/bulk-resummarize"
    );
    const result = await getResummarizeEpisodeCount({});

    expect(result.count).toBe(42);
    expect(result.error).toBeUndefined();
  });

  it("applies podcastId filter", async () => {
    mockCountResult(5);
    const { eq } = await import("drizzle-orm");

    const { getResummarizeEpisodeCount } = await import(
      "@/app/actions/bulk-resummarize"
    );
    await getResummarizeEpisodeCount({ podcastId: 7 });

    expect(eq).toHaveBeenCalledWith(
      expect.anything(), // episodes.podcastId
      7
    );
  });

  it("applies minDate filter", async () => {
    mockCountResult(10);
    const { gte } = await import("drizzle-orm");

    const { getResummarizeEpisodeCount } = await import(
      "@/app/actions/bulk-resummarize"
    );
    await getResummarizeEpisodeCount({ minDate: "2024-01-01" });

    expect(gte).toHaveBeenCalledWith(
      expect.anything(), // episodes.publishDate
      new Date("2024-01-01")
    );
  });

  it("applies maxDate filter", async () => {
    mockCountResult(8);
    const { lte } = await import("drizzle-orm");

    const { getResummarizeEpisodeCount } = await import(
      "@/app/actions/bulk-resummarize"
    );
    await getResummarizeEpisodeCount({ maxDate: "2024-12-31" });

    expect(lte).toHaveBeenCalledWith(
      expect.anything(), // episodes.publishDate
      new Date("2024-12-31")
    );
  });

  it("applies maxScore filter", async () => {
    mockCountResult(3);
    const { lte } = await import("drizzle-orm");

    const { getResummarizeEpisodeCount } = await import(
      "@/app/actions/bulk-resummarize"
    );
    await getResummarizeEpisodeCount({ maxScore: 5 });

    expect(lte).toHaveBeenCalledWith(
      expect.anything(), // episodes.worthItScore
      String(5)
    );
  });

  it("applies all filters together", async () => {
    mockCountResult(2);
    const { eq, gte, lte } = await import("drizzle-orm");

    const { getResummarizeEpisodeCount } = await import(
      "@/app/actions/bulk-resummarize"
    );
    await getResummarizeEpisodeCount({
      podcastId: 3,
      minDate: "2024-01-01",
      maxDate: "2024-06-30",
      maxScore: 7,
    });

    expect(eq).toHaveBeenCalled();
    expect(gte).toHaveBeenCalled();
    expect(lte).toHaveBeenCalledTimes(2); // maxDate and maxScore both use lte
  });

  it("always includes processedAt IS NOT NULL condition", async () => {
    mockCountResult(10);
    const { isNotNull } = await import("drizzle-orm");

    const { getResummarizeEpisodeCount } = await import(
      "@/app/actions/bulk-resummarize"
    );
    await getResummarizeEpisodeCount({});

    expect(isNotNull).toHaveBeenCalled();
  });

  it("returns error object when database query fails", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error("DB connection failed")),
      }),
    });

    const { getResummarizeEpisodeCount } = await import(
      "@/app/actions/bulk-resummarize"
    );
    const result = await getResummarizeEpisodeCount({});

    expect(result.count).toBe(0);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe("string");
  });
});
