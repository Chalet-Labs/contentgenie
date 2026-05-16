export const BOOKMARK_CHANGED_EVENT = "bookmark-changed";
export const LISTEN_STATE_CHANGED_EVENT = "listen-state-changed";
export const NOTIFICATIONS_CHANGED_EVENT = "notifications-changed";
export const PINS_CHANGED_EVENT = "pins-changed";

export type NotificationsChangedAction = "mark-all";

export type NotificationsChangedEventDetail = {
  episodeDbIds: number[];
  action?: NotificationsChangedAction;
};

// Single dispatch point for NOTIFICATIONS_CHANGED_EVENT keeps the typed
// payload contract enforced at every call site. An empty array means
// "counts may have changed, no row-level reconcile" — consumers that filter
// by id (e.g. notification-page-list) treat it as a no-op while consumers
// that re-read aggregate counts (sidebar badge) still refresh.
//
// `action: 'mark-all'` is the explicit signal that every visible row should
// flip to read; page-level consumers use it to reconcile state when a sibling
// surface (e.g. the bell popover) marks everything read while the inbox is
// open.
export function dispatchNotificationsChanged(
  episodeDbIds: number[],
  action?: NotificationsChangedAction,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<NotificationsChangedEventDetail>(
      NOTIFICATIONS_CHANGED_EVENT,
      { detail: action ? { episodeDbIds, action } : { episodeDbIds } },
    ),
  );
}
