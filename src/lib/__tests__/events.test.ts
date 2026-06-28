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

  it("no-ops during SSR when window is unavailable", () => {
    vi.stubGlobal("window", undefined);

    expect(() => dispatchNotificationsChanged([12], "mark-all")).not.toThrow();
  });

  it("dispatches an event with episode ids when no action is provided", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    dispatchNotificationsChanged([12, 34]);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const event = dispatchSpy.mock.calls[0]?.[0];
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event?.type).toBe(NOTIFICATIONS_CHANGED_EVENT);
    expect((event as CustomEvent).detail).toEqual({
      episodeDbIds: [12, 34],
    });
  });

  it("includes the action discriminator when provided", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    dispatchNotificationsChanged([], "mark-all");

    const event = dispatchSpy.mock.calls[0]?.[0] as CustomEvent;
    expect(event.detail).toEqual({
      episodeDbIds: [],
      action: "mark-all",
    });
  });
});
