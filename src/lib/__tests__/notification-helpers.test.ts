import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCount = vi.fn();
vi.mock("@/db", () => ({
  db: {
    $count: (...args: unknown[]) => mockCount(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  notifications: {
    userId: "user_id",
    isRead: "is_read",
    isDismissed: "is_dismissed",
  },
}));

const mockEq = vi.fn((...args: unknown[]) => ({ kind: "eq", args }));
const mockAnd = vi.fn((...args: unknown[]) => ({ kind: "and", args }));
vi.mock("drizzle-orm", () => ({
  eq: (...args: unknown[]) => mockEq(...args),
  and: (...args: unknown[]) => mockAnd(...args),
}));

describe("countUnreadNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts only unread and non-dismissed notifications for the user", async () => {
    mockCount.mockResolvedValue(7);

    const { countUnreadNotifications } =
      await import("@/lib/notifications-query");
    const { notifications } = await import("@/db/schema");

    await expect(countUnreadNotifications("user_123")).resolves.toBe(7);

    expect(mockEq).toHaveBeenCalledWith(notifications.userId, "user_123");
    expect(mockEq).toHaveBeenCalledWith(notifications.isRead, false);
    expect(mockEq).toHaveBeenCalledWith(notifications.isDismissed, false);
    expect(mockAnd).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "eq" }),
      expect.objectContaining({ kind: "eq" }),
      expect.objectContaining({ kind: "eq" }),
    );
    expect(mockCount).toHaveBeenCalledWith(
      notifications,
      expect.objectContaining({ kind: "and" }),
    );
  });
});

describe("dispatchNotificationsChanged", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("dispatches the default payload shape without an action", async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent } as unknown as Window);

    const { dispatchNotificationsChanged, NOTIFICATIONS_CHANGED_EVENT } =
      await import("@/lib/events");

    dispatchNotificationsChanged([10, 20]);

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const event = dispatchEvent.mock.calls[0]?.[0] as CustomEvent<{
      episodeDbIds: number[];
      action?: string;
    }>;
    expect(event.type).toBe(NOTIFICATIONS_CHANGED_EVENT);
    expect(event.detail).toEqual({ episodeDbIds: [10, 20] });
  });

  it("dispatches the mark-all payload shape when an action is provided", async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent } as unknown as Window);

    const { dispatchNotificationsChanged } = await import("@/lib/events");

    dispatchNotificationsChanged([], "mark-all");

    const event = dispatchEvent.mock.calls[0]?.[0] as CustomEvent<{
      episodeDbIds: number[];
      action?: string;
    }>;
    expect(event.detail).toEqual({ episodeDbIds: [], action: "mark-all" });
  });

  it("is a no-op when called without a window", async () => {
    vi.stubGlobal("window", undefined);

    const { dispatchNotificationsChanged } = await import("@/lib/events");

    expect(() => dispatchNotificationsChanged([10])).not.toThrow();
  });
});
