import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  dispatchNotificationsChanged,
  NOTIFICATIONS_CHANGED_EVENT,
} from "@/lib/events";

describe("dispatchNotificationsChanged", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches the ids-only payload for row-level reconcile events", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    dispatchNotificationsChanged([11, 22]);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const event = dispatchSpy.mock.calls[0]?.[0];
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event?.type).toBe(NOTIFICATIONS_CHANGED_EVENT);
    expect((event as CustomEvent).detail).toEqual({ episodeDbIds: [11, 22] });
  });

  it("dispatches the mark-all action for aggregate read transitions", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    dispatchNotificationsChanged([], "mark-all");

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const event = dispatchSpy.mock.calls[0]?.[0];
    expect((event as CustomEvent).detail).toEqual({
      episodeDbIds: [],
      action: "mark-all",
    });
  });
});
