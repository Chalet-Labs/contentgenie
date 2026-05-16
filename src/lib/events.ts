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
// payload contract enforced at every call site. The payload has two
// independent dimensions: `episodeDbIds` (which rows to reconcile) and the
// optional `action` (what kind of mutation triggered the event).
//
// Payload meanings:
// - Empty `episodeDbIds`, no `action` → "aggregate counts may have changed,
//   no row-level reconcile." `notification-page-list` treats it as a no-op
//   for visible rows; the sidebar badge still re-fetches counts.
// - Non-empty `episodeDbIds`, no `action` → "the listed episode rows were
//   removed/read on the server." `notification-page-list` drops matching
//   rows; the sidebar badge re-fetches counts.
// - `action: 'mark-all'` (with empty `episodeDbIds`) → every visible row
//   should flip to read; page-level consumers use it to reconcile state
//   when a sibling surface (e.g. the bell popover) marks everything read
//   while the inbox is open. Despite the empty array, this DOES trigger
//   row-level reconciliation — the empty-array no-op rule only applies
//   when `action` is absent.
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
