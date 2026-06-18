import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NOTIFICATIONS_CHANGED_EVENT,
  dispatchNotificationsChanged,
} from "@/lib/events";

describe("dispatchNotificationsChanged", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("dispatches NOTIFICATIONS_CHANGED_EVENT with episodeDbIds only when no action is provided", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    dispatchNotificationsChanged([10, 42]);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const dispatched = dispatchSpy.mock.calls[0]?.[0];
    expect(dispatched).toBeInstanceOf(CustomEvent);
    expect(dispatched?.type).toBe(NOTIFICATIONS_CHANGED_EVENT);
    expect((dispatched as CustomEvent).detail).toEqual({
      episodeDbIds: [10, 42],
    });
  });

  it("dispatches NOTIFICATIONS_CHANGED_EVENT with action='mark-all' when provided", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    dispatchNotificationsChanged([], "mark-all");

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const dispatched = dispatchSpy.mock.calls[0]?.[0];
    expect(dispatched).toBeInstanceOf(CustomEvent);
    expect(dispatched?.type).toBe(NOTIFICATIONS_CHANGED_EVENT);
    expect((dispatched as CustomEvent).detail).toEqual({
      episodeDbIds: [],
      action: "mark-all",
    });
  });

  it("is a no-op when window is unavailable", () => {
    vi.stubGlobal("window", undefined);

    expect(() => dispatchNotificationsChanged([7], "mark-all")).not.toThrow();
  });
});
