import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NOTIFICATIONS_CHANGED_EVENT,
  dispatchAllNotificationsRead,
  dispatchNotificationCountsChanged,
  dispatchNotificationsDismissed,
  type NotificationsChangedEventDetail,
} from "@/lib/events";

describe("notification event dispatchers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches a counts-only event without row reconciliation data", () => {
    const listener = vi.fn();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);

    dispatchNotificationCountsChanged();

    const event = listener.mock
      .calls[0]?.[0] as CustomEvent<NotificationsChangedEventDetail>;
    expect(event.detail).toEqual({ episodeDbIds: [] });
    window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);
  });

  it("dispatches dismissed episode ids and ignores an empty dismissal", () => {
    const listener = vi.fn();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);

    dispatchNotificationsDismissed([10, 20]);
    dispatchNotificationsDismissed([]);

    expect(listener).toHaveBeenCalledOnce();
    const event = listener.mock
      .calls[0]?.[0] as CustomEvent<NotificationsChangedEventDetail>;
    expect(event.detail).toEqual({ episodeDbIds: [10, 20] });
    window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);
  });

  it("dispatches the mark-all-read action", () => {
    const listener = vi.fn();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);

    dispatchAllNotificationsRead();

    const event = listener.mock
      .calls[0]?.[0] as CustomEvent<NotificationsChangedEventDetail>;
    expect(event.detail).toEqual({ episodeDbIds: [], action: "mark-all" });
    window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);
  });
});
