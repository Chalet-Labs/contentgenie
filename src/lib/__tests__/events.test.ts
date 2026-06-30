import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  NOTIFICATIONS_CHANGED_EVENT,
  dispatchNotificationsChanged,
} from "@/lib/events";

describe("dispatchNotificationsChanged", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches a counts-only notifications event when no action is provided", () => {
    const dispatchEvent = vi.spyOn(window, "dispatchEvent");

    dispatchNotificationsChanged([10, 20]);

    expect(dispatchEvent).toHaveBeenCalledOnce();
    const event = dispatchEvent.mock.calls[0]?.[0];
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event?.type).toBe(NOTIFICATIONS_CHANGED_EVENT);
    expect((event as CustomEvent).detail).toEqual({ episodeDbIds: [10, 20] });
  });

  it("includes the action in the dispatched event detail when provided", () => {
    const dispatchEvent = vi.spyOn(window, "dispatchEvent");

    dispatchNotificationsChanged([], "mark-all");

    expect(dispatchEvent).toHaveBeenCalledOnce();
    const event = dispatchEvent.mock.calls[0]?.[0] as CustomEvent;
    expect(event.type).toBe(NOTIFICATIONS_CHANGED_EVENT);
    expect(event.detail).toEqual({ episodeDbIds: [], action: "mark-all" });
  });
});
