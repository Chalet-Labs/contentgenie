import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDashboardStats } from "../dashboard";
import { db } from "@/db";

// Mock Clerk auth
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

// Mock database
const mockFrom = vi.fn();
const mockWhere = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

// Mock schema
vi.mock("@/db/schema", () => ({
  userSubscriptions: { userId: "user_id" },
  userLibrary: { userId: "user_id" },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  sql: vi.fn(),
}));

describe("getDashboardStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup chained mock
    (db.select as any).mockReturnValue({
      from: mockFrom.mockReturnValue({
        where: mockWhere,
      }),
    });
  });

  it("returns error when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const result = await getDashboardStats();

    expect(result.subscriptionCount).toBe(0);
    expect(result.savedCount).toBe(0);
    expect(result.error).toMatch(/signed in/i);
  });

  it("returns counts correctly using SQL COUNT()", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });

    mockWhere
      .mockResolvedValueOnce([{ count: 5 }]) // for subscriptions
      .mockResolvedValueOnce([{ count: 3 }]); // for library

    const result = await getDashboardStats();

    expect(result.subscriptionCount).toBe(5);
    expect(result.savedCount).toBe(3);
    expect(result.error).toBeNull();

    expect(db.select).toHaveBeenCalledTimes(2);
    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(mockWhere).toHaveBeenCalledTimes(2);
  });

  it("handles zero counts correctly", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });

    mockWhere.mockResolvedValue([]); // for both

    const result = await getDashboardStats();

    expect(result.subscriptionCount).toBe(0);
    expect(result.savedCount).toBe(0);
    expect(result.error).toBeNull();
  });
});
