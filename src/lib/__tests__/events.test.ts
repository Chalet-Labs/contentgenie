import { describe, it, expect, vi, afterEach } from "vitest";
import {
  NOTIFICATIONS_CHANGED_EVENT,
  dispatchNotificationsChanged,
} from "@/lib/events";

describe("dispatchNotificationsChanged", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches a counts-only payload when no action is provided", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    dispatchNotificationsChanged([10, 20]);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const event = dispatchSpy.mock.calls[0]?.[0];
    expect(event).toBeInstanceOf(CustomEvent);
    expect((event as CustomEvent).type).toBe(NOTIFICATIONS_CHANGED_EVENT);
    expect((event as CustomEvent).detail).toEqual({ episodeDbIds: [10, 20] });
  });

  it("dispatches mark-all payloads with the action included", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    dispatchNotificationsChanged([], "mark-all");

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const event = dispatchSpy.mock.calls[0]?.[0];
    expect(event).toBeInstanceOf(CustomEvent);
    expect((event as CustomEvent).detail).toEqual({
      episodeDbIds: [],
      action: "mark-all",
    });
  });
});
