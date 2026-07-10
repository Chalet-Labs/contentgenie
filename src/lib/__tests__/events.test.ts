import { afterEach, describe, expect, it, vi } from "vitest";

describe("dispatchNotificationsChanged", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("dispatches the base event payload without an action", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const { NOTIFICATIONS_CHANGED_EVENT, dispatchNotificationsChanged } =
      await import("@/lib/events");

    dispatchNotificationsChanged([11, 22]);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const event = dispatchSpy.mock.calls[0]?.[0];
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event?.type).toBe(NOTIFICATIONS_CHANGED_EVENT);
    expect((event as CustomEvent).detail).toEqual({ episodeDbIds: [11, 22] });
  });

  it("includes the mark-all action when provided", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const { dispatchNotificationsChanged } = await import("@/lib/events");

    dispatchNotificationsChanged([], "mark-all");

    const event = dispatchSpy.mock.calls[0]?.[0] as CustomEvent;
    expect(event.detail).toEqual({ episodeDbIds: [], action: "mark-all" });
  });

  it("is a no-op during server-side execution", async () => {
    vi.stubGlobal("window", undefined);
    const { dispatchNotificationsChanged } = await import("@/lib/events");

    expect(() => dispatchNotificationsChanged([5], "mark-all")).not.toThrow();
  });
});
