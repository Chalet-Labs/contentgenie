import { describe, expect, it, vi, afterEach } from "vitest";
import {
  dispatchNotificationsChanged,
  NOTIFICATIONS_CHANGED_EVENT,
} from "@/lib/events";

describe("dispatchNotificationsChanged", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing during server-side execution when window is unavailable", () => {
    vi.stubGlobal("window", undefined);

    expect(() => dispatchNotificationsChanged([10, 11])).not.toThrow();
  });

  it("dispatches the base payload without an action discriminator", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });

    dispatchNotificationsChanged([10, 11]);

    expect(dispatchEvent).toHaveBeenCalledOnce();
    const event = dispatchEvent.mock.calls[0][0] as CustomEvent<{
      episodeDbIds: number[];
      action?: string;
    }>;
    expect(event.type).toBe(NOTIFICATIONS_CHANGED_EVENT);
    expect(event.detail).toEqual({ episodeDbIds: [10, 11] });
  });

  it("dispatches mark-all events with the action discriminator", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });

    dispatchNotificationsChanged([], "mark-all");

    expect(dispatchEvent).toHaveBeenCalledOnce();
    const event = dispatchEvent.mock.calls[0][0] as CustomEvent<{
      episodeDbIds: number[];
      action?: string;
    }>;
    expect(event.type).toBe(NOTIFICATIONS_CHANGED_EVENT);
    expect(event.detail).toEqual({ episodeDbIds: [], action: "mark-all" });
  });
});
