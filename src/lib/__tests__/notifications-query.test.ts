import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEq = vi.fn((...args: unknown[]) => ({ kind: "eq", args }));
const mockAnd = vi.fn((...args: unknown[]) => ({ kind: "and", args }));
const mockCount = vi.fn();

vi.mock("drizzle-orm", () => ({
  eq: (...args: unknown[]) => mockEq(...args),
  and: (...args: unknown[]) => mockAnd(...args),
}));

vi.mock("@/db/schema", () => ({
  notifications: {
    userId: "notifications.userId",
    isRead: "notifications.isRead",
    isDismissed: "notifications.isDismissed",
  },
}));

vi.mock("@/db", () => ({
  db: {
    $count: (...args: unknown[]) => mockCount(...args),
  },
}));

describe("countUnreadNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts only unread and undismissed notifications for the given user", async () => {
    mockCount.mockResolvedValue(7);

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
      { kind: "eq", args: ["notifications.userId", "user-123"] },
      { kind: "eq", args: ["notifications.isRead", false] },
      { kind: "eq", args: ["notifications.isDismissed", false] },
    );
    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "notifications.userId",
        isRead: "notifications.isRead",
        isDismissed: "notifications.isDismissed",
      }),
      {
        kind: "and",
        args: [
          { kind: "eq", args: ["notifications.userId", "user-123"] },
          { kind: "eq", args: ["notifications.isRead", false] },
          { kind: "eq", args: ["notifications.isDismissed", false] },
        ],
      },
    );
  });
});
