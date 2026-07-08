// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifications } from "@/db/schema";

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
  and: vi.fn((...args: unknown[]) => ({ kind: "and", args })),
  eq: vi.fn((...args: unknown[]) => ({ kind: "eq", args })),
}));

import { countUnreadNotifications } from "@/lib/notifications-query";

describe("countUnreadNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts only rows that match the unread-and-not-dismissed predicate", async () => {
    mockCount.mockResolvedValue(6);

    const result = await countUnreadNotifications("user-123");

    expect(result).toBe(6);
    expect(mockCount).toHaveBeenCalledWith(notifications, {
      kind: "and",
      args: [
        { kind: "eq", args: ["notifications.userId", "user-123"] },
        { kind: "eq", args: ["notifications.isRead", false] },
        { kind: "eq", args: ["notifications.isDismissed", false] },
      ],
    });
  });
});
