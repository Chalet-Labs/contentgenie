import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockCount = vi.fn();
const mockEq = vi.fn((...args: unknown[]) => ({ op: "eq", args }));
const mockAnd = vi.fn((...args: unknown[]) => ({ op: "and", args }));

vi.mock("@/db", () => ({
  db: {
    $count: (...args: unknown[]) => mockCount(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  notifications: {
    userId: "notifications.userId",
    isRead: "notifications.isRead",
    isDismissed: "notifications.isDismissed",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (...args: unknown[]) => mockEq(...args),
  and: (...args: unknown[]) => mockAnd(...args),
}));

describe("countUnreadNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("counts only rows that match the shared unread predicate", async () => {
    mockCount.mockResolvedValueOnce(7);

    const { countUnreadNotifications } =
      await import("@/lib/notifications-query");

    await expect(countUnreadNotifications("user-123")).resolves.toBe(7);

    expect(mockEq).toHaveBeenNthCalledWith(
      1,
      "notifications.userId",
      "user-123",
    );
    expect(mockEq).toHaveBeenNthCalledWith(2, "notifications.isRead", false);
    expect(mockEq).toHaveBeenNthCalledWith(
      3,
      "notifications.isDismissed",
      false,
    );
    expect(mockAnd).toHaveBeenCalledWith(
      { op: "eq", args: ["notifications.userId", "user-123"] },
      { op: "eq", args: ["notifications.isRead", false] },
      { op: "eq", args: ["notifications.isDismissed", false] },
    );
    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "notifications.userId",
        isRead: "notifications.isRead",
        isDismissed: "notifications.isDismissed",
      }),
      {
        op: "and",
        args: [
          { op: "eq", args: ["notifications.userId", "user-123"] },
          { op: "eq", args: ["notifications.isRead", false] },
          { op: "eq", args: ["notifications.isDismissed", false] },
        ],
      },
    );
  });
});
