import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCount = vi.fn();
const mockEq = vi.fn((...args: unknown[]) => args);
const mockAnd = vi.fn((...args: unknown[]) => args);

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
  and: (...args: unknown[]) => mockAnd(...args),
  eq: (...args: unknown[]) => mockEq(...args),
}));

describe("countUnreadNotifications", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("counts only unread and undismissed notifications for the user", async () => {
    mockCount.mockResolvedValue(7);

    const { countUnreadNotifications } =
      await import("@/lib/notifications-query");
    const total = await countUnreadNotifications("user-123");

    expect(total).toBe(7);
    expect(mockEq).toHaveBeenCalledWith("notifications.userId", "user-123");
    expect(mockEq).toHaveBeenCalledWith("notifications.isRead", false);
    expect(mockEq).toHaveBeenCalledWith("notifications.isDismissed", false);
    expect(mockAnd).toHaveBeenCalledWith(
      ["notifications.userId", "user-123"],
      ["notifications.isRead", false],
      ["notifications.isDismissed", false],
    );
    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "notifications.userId",
        isRead: "notifications.isRead",
        isDismissed: "notifications.isDismissed",
      }),
      [
        ["notifications.userId", "user-123"],
        ["notifications.isRead", false],
        ["notifications.isDismissed", false],
      ],
    );
  });
});
