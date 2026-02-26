"use server";

import { auth } from "@clerk/nextjs/server";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { db } from "@/db";
import { notifications, episodes, podcasts, users } from "@/db/schema";

export async function getNotifications(limit = 20, offset = 0) {
  const { userId } = await auth();
  if (!userId) {
    return { notifications: [], error: "You must be signed in" };
  }

  try {
    const results = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        title: notifications.title,
        body: notifications.body,
        isRead: notifications.isRead,
        createdAt: notifications.createdAt,
        episodeId: notifications.episodeId,
        episodeTitle: episodes.title,
        podcastTitle: podcasts.title,
      })
      .from(notifications)
      .leftJoin(episodes, eq(notifications.episodeId, episodes.id))
      .leftJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    return { notifications: results, error: null };
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return { notifications: [], error: "Failed to load notifications" };
  }
}

export async function getUnreadCount(): Promise<number> {
  const { userId } = await auth();
  if (!userId) return 0;

  try {
    const [result] = await db
      .select({ value: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isRead, false)
        )
      );

    return result?.value ?? 0;
  } catch (error) {
    console.error("Error fetching unread count:", error);
    return 0;
  }
}

export async function markNotificationRead(notificationId: number) {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "You must be signed in" };
  }

  try {
    const result = await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId)
        )
      )
      .returning({ id: notifications.id });

    if (result.length === 0) {
      return { success: false, error: "Notification not found" };
    }

    return { success: true };
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return { success: false, error: "Failed to mark notification as read" };
  }
}

export async function markAllNotificationsRead() {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "You must be signed in" };
  }

  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isRead, false)
        )
      );

    return { success: true };
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return {
      success: false,
      error: "Failed to mark all notifications as read",
    };
  }
}

export async function updateNotificationPreferences(prefs: {
  digestFrequency?: "realtime" | "daily" | "weekly";
  pushEnabled?: boolean;
}) {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "You must be signed in" };
  }

  try {
    // Read-modify-write to preserve existing preference fields
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { preferences: true },
    });

    const currentPrefs = user?.preferences ?? {};
    const updatedPrefs = { ...currentPrefs, ...prefs };

    await db
      .update(users)
      .set({ preferences: updatedPrefs, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return { success: true };
  } catch (error) {
    console.error("Error updating notification preferences:", error);
    return {
      success: false,
      error: "Failed to update notification preferences",
    };
  }
}

export async function getNotificationPreferences() {
  const { userId } = await auth();
  if (!userId) {
    return {
      digestFrequency: "realtime" as const,
      pushEnabled: false,
    };
  }

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { preferences: true },
    });

    return {
      digestFrequency: user?.preferences?.digestFrequency ?? "realtime",
      pushEnabled: user?.preferences?.pushEnabled ?? false,
    };
  } catch (error) {
    console.error("Error fetching notification preferences:", error);
    return {
      digestFrequency: "realtime" as const,
      pushEnabled: false,
    };
  }
}
