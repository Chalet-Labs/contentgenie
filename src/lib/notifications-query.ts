import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";

// Single source of truth for the "unread" predicate. Both the bell's
// getUnreadCount and the dashboard sidebar's unreadNotificationCount must
// agree on what counts as unread — keep the filter here and import it from
// both call sites so a future predicate change (e.g. a new "archived"
// column) lands once. "Unread" = not read AND not dismissed: dismissed
// rows stay in the DB but must not contribute to the badge.
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
