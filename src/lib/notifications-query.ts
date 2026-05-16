import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";

// Single source of truth for the "unread" predicate. All three consumers —
// the bell's `getUnreadCount`, the popover's `getNotificationSummary`
// (`totalUnread`), and the dashboard sidebar's `unreadNotificationCount`
// via `getDashboardStats` — must agree on what counts as unread. Keep the
// filter here and import it from every call site so a future predicate
// change (e.g. a new "archived" column) lands once. "Unread" = not read
// AND not dismissed: dismissed rows stay in the DB but must not contribute
// to the badge.
export async function countUnreadNotifications(
  userId: string,
): Promise<number> {
  return db.$count(
    notifications,
    and(
      eq(notifications.userId, userId),
      eq(notifications.isRead, false),
      eq(notifications.isDismissed, false),
    ),
  );
}
