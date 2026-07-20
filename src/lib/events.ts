export const BOOKMARK_CHANGED_EVENT = "bookmark-changed";
export const LISTEN_STATE_CHANGED_EVENT = "listen-state-changed";
export const NOTIFICATIONS_CHANGED_EVENT = "notifications-changed";
export const PINS_CHANGED_EVENT = "pins-changed";

export type NotificationsChangedAction = "mark-all";

export type NotificationsChangedEventDetail = {
  episodeDbIds: number[];
  action?: NotificationsChangedAction;
};

function dispatchNotificationsChanged(
  detail: NotificationsChangedEventDetail,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<NotificationsChangedEventDetail>(
      NOTIFICATIONS_CHANGED_EVENT,
      { detail },
    ),
  );
}

/** Notify aggregate-count consumers after a mutation already reconciled its own rows. */
export function dispatchNotificationCountsChanged(): void {
  dispatchNotificationsChanged({ episodeDbIds: [] });
}

/** Remove notifications for episodes confirmed dismissed by the server. */
export function dispatchNotificationsDismissed(episodeDbIds: number[]): void {
  if (episodeDbIds.length === 0) return;
  dispatchNotificationsChanged({ episodeDbIds });
}

/** Mark every visible notification read after the server confirms mark-all. */
export function dispatchAllNotificationsRead(): void {
  dispatchNotificationsChanged({ episodeDbIds: [], action: "mark-all" });
}
