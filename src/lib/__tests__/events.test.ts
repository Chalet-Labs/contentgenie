import { describe, it, expect, vi, afterEach } from "vitest";

const globalWithWindow = globalThis as unknown as { window?: Window };
const originalWindow = globalWithWindow.window;

describe("dispatchNotificationsChanged", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (originalWindow === undefined) {
      globalWithWindow.window = undefined;
    } else {
      globalWithWindow.window = originalWindow;
    }
  });

  it("dispatches the mark-all payload shape for inbox-wide read sync", async () => {
    const dispatchEvent = vi.fn();
    globalWithWindow.window = { dispatchEvent } as unknown as Window;

    const { dispatchNotificationsChanged, NOTIFICATIONS_CHANGED_EVENT } =
      await import("@/lib/events");

    dispatchNotificationsChanged([], "mark-all");

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const event = dispatchEvent.mock.calls[0][0] as CustomEvent<{
      episodeDbIds: number[];
      action?: "mark-all";
    }>;
    expect(event.type).toBe(NOTIFICATIONS_CHANGED_EVENT);
    expect(event.detail).toEqual({ episodeDbIds: [], action: "mark-all" });
  });

  it("no-ops when window is unavailable", async () => {
    globalWithWindow.window = undefined;

    const { dispatchNotificationsChanged } = await import("@/lib/events");

    expect(() => dispatchNotificationsChanged([42])).not.toThrow();
  });
});
