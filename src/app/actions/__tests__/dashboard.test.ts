import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Clerk auth
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

// Mock database
vi.mock("@/db", () => ({
  db: {
    $count: vi.fn(),
  },
}));

// Mock schema
vi.mock("@/db/schema", () => ({
  userSubscriptions: { userId: "user_id" },
  userLibrary: { userId: "user_id" },
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
