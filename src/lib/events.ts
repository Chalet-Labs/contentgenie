export const BOOKMARK_CHANGED_EVENT = "bookmark-changed";
export const LISTEN_STATE_CHANGED_EVENT = "listen-state-changed";
export const NOTIFICATIONS_CHANGED_EVENT = "notifications-changed";
export const PINS_CHANGED_EVENT = "pins-changed";

export type NotificationsChangedEventDetail = { episodeDbIds: number[] };

// Single dispatch point for NOTIFICATIONS_CHANGED_EVENT keeps the typed
// payload contract enforced at every call site. An empty array means
// "counts may have changed, no row-level reconcile" — consumers that filter
// by id (e.g. notification-page-list) treat it as a no-op while consumers
// that re-read aggregate counts (sidebar badge) still refresh.
export function dispatchNotificationsChanged(episodeDbIds: number[]): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<NotificationsChangedEventDetail>(
      NOTIFICATIONS_CHANGED_EVENT,
      { detail: { episodeDbIds } },
    ),
  );
}
