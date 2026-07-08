import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dispatchNotificationsChanged,
  NOTIFICATIONS_CHANGED_EVENT,
} from "@/lib/events";

describe("dispatchNotificationsChanged", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.window = originalWindow;
  });

  it("dispatches the counts-only payload when no action is provided", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    dispatchNotificationsChanged([10, 11]);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent<{
      episodeDbIds: number[];
      action?: "mark-all";
    }>;
    expect(event.type).toBe(NOTIFICATIONS_CHANGED_EVENT);
    expect(event.detail).toEqual({ episodeDbIds: [10, 11] });
  });

  it("dispatches the mark-all payload when action is provided", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    dispatchNotificationsChanged([], "mark-all");

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent<{
      episodeDbIds: number[];
      action?: "mark-all";
    }>;
    expect(event.type).toBe(NOTIFICATIONS_CHANGED_EVENT);
    expect(event.detail).toEqual({ episodeDbIds: [], action: "mark-all" });
  });

  it("is a no-op when window is unavailable", () => {
    // @ts-expect-error test-only override for the runtime guard
    globalThis.window = undefined;

    expect(() => dispatchNotificationsChanged([42], "mark-all")).not.toThrow();
  });
});
