import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Clerk auth
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

// Mock database
const mockFindFirst = vi.fn();
vi.mock("@/db", () => ({
  db: {
    $count: vi.fn(),
    query: {
      trendingTopics: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
    },
  },
}));

// Mock schema
vi.mock("@/db/schema", () => ({
  userSubscriptions: { userId: "user_id" },
  userLibrary: { userId: "user_id" },
  trendingTopics: { generatedAt: "generated_at" },
}));

// Mock drizzle-orm — include all imports used by dashboard.ts
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ _op: "eq", args })),
  desc: vi.fn(),
}));

describe("getDashboardStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns error when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { getDashboardStats } = await import("@/app/actions/dashboard");
    const result = await getDashboardStats();

    expect(result.subscriptionCount).toBe(0);
    expect(result.savedCount).toBe(0);
    expect(result.error).toMatch(/signed in/i);
  });

  it("returns counts correctly using SQL COUNT()", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });

    const { db } = await import("@/db");
    (db.$count as any)
      .mockResolvedValueOnce(5) // for subscriptions
      .mockResolvedValueOnce(3); // for library

    const { getDashboardStats } = await import("@/app/actions/dashboard");
    const { eq } = await import("drizzle-orm");
    const { userSubscriptions, userLibrary } = await import("@/db/schema");
    const result = await getDashboardStats();

    expect(result.subscriptionCount).toBe(5);
    expect(result.savedCount).toBe(3);
    expect(result.error).toBeNull();

    expect(db.$count).toHaveBeenCalledTimes(2);
    expect(db.$count).toHaveBeenCalledWith(
      userSubscriptions,
      expect.anything()
    );
    expect(db.$count).toHaveBeenCalledWith(userLibrary, expect.anything());
    expect(eq).toHaveBeenCalledWith("user_id", "user_123");
  });

  it("handles zero counts correctly", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });

    const { db } = await import("@/db");
    (db.$count as any).mockResolvedValue(0);

    const { getDashboardStats } = await import("@/app/actions/dashboard");
    const result = await getDashboardStats();

    expect(result.subscriptionCount).toBe(0);
    expect(result.savedCount).toBe(0);
    expect(result.error).toBeNull();
  });

  it("handles database errors gracefully", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });

    const { db } = await import("@/db");
    (db.$count as any).mockRejectedValue(new Error("DB connection failed"));

    const { getDashboardStats } = await import("@/app/actions/dashboard");
    const result = await getDashboardStats();

    expect(result.subscriptionCount).toBe(0);
    expect(result.savedCount).toBe(0);
    expect(result.error).toMatch(/failed to load/i);
  });
});

describe("getTrendingTopics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns error when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { getTrendingTopics } = await import("@/app/actions/dashboard");
    const result = await getTrendingTopics();

    expect(result.topics).toBeNull();
    expect(result.error).toMatch(/signed in/i);
  });

  it("returns null topics when no snapshots exist", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockFindFirst.mockResolvedValue(undefined);

    const { getTrendingTopics } = await import("@/app/actions/dashboard");
    const result = await getTrendingTopics();

    expect(result.topics).toBeNull();
    expect(result.error).toBeNull();
  });

  it("returns formatted trending topics from latest snapshot", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });

    const mockSnapshot = {
      id: 1,
      topics: [
        {
          name: "AI & ML",
          description: "Artificial intelligence trends",
          episodeCount: 5,
          episodeIds: [1, 2, 3, 4, 5],
        },
      ],
      generatedAt: new Date("2026-03-13T06:00:00Z"),
      periodStart: new Date("2026-03-06T06:00:00Z"),
      periodEnd: new Date("2026-03-13T06:00:00Z"),
      episodeCount: 10,
      createdAt: new Date("2026-03-13T06:00:00Z"),
    };
    mockFindFirst.mockResolvedValue(mockSnapshot);

    const { getTrendingTopics } = await import("@/app/actions/dashboard");
    const result = await getTrendingTopics();

    expect(result.error).toBeNull();
    expect(result.topics).not.toBeNull();
    expect(result.topics!.items).toHaveLength(1);
    expect(result.topics!.items[0].name).toBe("AI & ML");
    expect(result.topics!.generatedAt).toEqual(mockSnapshot.generatedAt);
    expect(result.topics!.periodStart).toEqual(mockSnapshot.periodStart);
    expect(result.topics!.periodEnd).toEqual(mockSnapshot.periodEnd);
    expect(result.topics!.episodeCount).toBe(10);
  });

  it("returns error on database failure", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockFindFirst.mockRejectedValue(new Error("DB connection failed"));

    const { getTrendingTopics } = await import("@/app/actions/dashboard");
    const result = await getTrendingTopics();

    expect(result.topics).toBeNull();
    expect(result.error).toMatch(/failed to load/i);
  });
});
