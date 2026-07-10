import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCount = vi.fn();

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
  and: vi.fn((...args: unknown[]) => ({ _op: "and", args })),
  eq: vi.fn((...args: unknown[]) => ({ _op: "eq", args })),
}));

describe("countUnreadNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts only unread and non-dismissed rows for the given user", async () => {
    mockCount.mockResolvedValue(6);

    const { and, eq } = await import("drizzle-orm");
    const { notifications } = await import("@/db/schema");
    const { countUnreadNotifications } =
      await import("@/lib/notifications-query");

    await expect(countUnreadNotifications("user_123")).resolves.toBe(6);

    expect(eq).toHaveBeenCalledWith(notifications.userId, "user_123");
    expect(eq).toHaveBeenCalledWith(notifications.isRead, false);
    expect(eq).toHaveBeenCalledWith(notifications.isDismissed, false);
    expect(and).toHaveBeenCalledWith(
      expect.objectContaining({
        _op: "eq",
        args: [notifications.userId, "user_123"],
      }),
      expect.objectContaining({
        _op: "eq",
        args: [notifications.isRead, false],
      }),
      expect.objectContaining({
        _op: "eq",
        args: [notifications.isDismissed, false],
      }),
    );
    expect(mockCount).toHaveBeenCalledWith(
      notifications,
      expect.objectContaining({ _op: "and" }),
    );
  });
});
