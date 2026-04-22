"use server";

import { auth } from "@clerk/nextjs/server";
import { eq, and, desc, gte, sql, count, inArray } from "drizzle-orm";
import { db } from "@/db";
import { notifications, episodes, podcasts, users, episodeTopics } from "@/db/schema";

export type NotificationSummary = {
  totalUnread: number;
  lastSeenAt: Date | null;
  groups: Array<
    | { kind: "episodes_since_last_seen"; count: number }
    | {
        kind: "episodes_by_podcast";
        podcastId: number;
        podcastTitle: string;
        count: number;
      }
  >;
};

export async function getNotificationSummary(): Promise<NotificationSummary> {
  const { userId } = await auth();
  if (!userId) {
    return { totalUnread: 0, lastSeenAt: null, groups: [] };
  }

  // Query 1: last-seen proxy via MAX(createdAt) WHERE isRead = true
  const [lastSeenRow] = await db
    .select({ lastSeen: sql<Date | null>`MAX(${notifications.createdAt})` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, true),
        eq(notifications.isDismissed, false)
      )
    );
  const lastSeenAt = lastSeenRow?.lastSeen ?? null;

  // Query 2: per-podcast groups over unread new_episode notifications
  const groupRows = await db
    .select({
      podcastId: podcasts.id,
      podcastTitle: podcasts.title,
      count: count(),
    })
    .from(notifications)
    .leftJoin(episodes, eq(notifications.episodeId, episodes.id))
    .leftJoin(podcasts, eq(episodes.podcastId, podcasts.id))
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false),
        eq(notifications.isDismissed, false),
        eq(notifications.type, "new_episode")
      )
    )
    .groupBy(podcasts.id, podcasts.title)
    .orderBy(desc(count()), podcasts.title);

  const podcastGroups = groupRows
    .filter((r) => r.podcastId !== null && r.podcastTitle !== null)
    .map((r) => ({
      kind: "episodes_by_podcast" as const,
      podcastId: r.podcastId!,
      podcastTitle: r.podcastTitle!,
      count: Number(r.count),
    }));

  const totalUnread = podcastGroups.reduce((sum, g) => sum + g.count, 0);

  const groups: NotificationSummary["groups"] = [];

  // Conditionally prepend the since-last-seen bucket
  if (lastSeenAt !== null && totalUnread > 0) {
    const [sinceRow] = await db
      .select({ sinceCount: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isRead, false),
          eq(notifications.isDismissed, false),
          eq(notifications.type, "new_episode"),
          gte(notifications.createdAt, lastSeenAt)
        )
      );
    const sinceCount = Number(sinceRow?.sinceCount ?? 0);
    // Omit bucket when it would duplicate totalUnread (all unread are "since last seen")
    if (sinceCount > 0 && sinceCount < totalUnread) {
      groups.push({ kind: "episodes_since_last_seen", count: sinceCount });
    }
  }

  groups.push(...podcastGroups);

  return { totalUnread, lastSeenAt, groups };
}

export async function getNotifications(
  limit = 50,
  offset = 0,
  filter?: { podcastId?: number; since?: Date }
) {
  const { userId } = await auth();
  if (!userId) {
    return { notifications: [], hasMore: false, error: "You must be signed in" };
  }

  const safeLimit = Number.isInteger(limit)
    ? Math.min(Math.max(limit, 1), 100)
    : 50;
  const safeOffset = Number.isInteger(offset) ? Math.max(offset, 0) : 0;

  const validPodcastId =
    filter?.podcastId !== undefined &&
    Number.isInteger(filter.podcastId) &&
    filter.podcastId > 0
      ? filter.podcastId
      : undefined;

  const validSince =
    filter?.since instanceof Date && !isNaN(filter.since.getTime())
      ? filter.since
      : undefined;

  try {
    const results = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        title: notifications.title,
        body: notifications.body,
        isRead: notifications.isRead,
        createdAt: notifications.createdAt,
        episodeDbId: notifications.episodeId,
        episodePodcastIndexId: episodes.podcastIndexId,
        episodeTitle: episodes.title,
        podcastTitle: podcasts.title,
        worthItScore: episodes.worthItScore,
        audioUrl: episodes.audioUrl,
        artwork: podcasts.imageUrl,
        duration: episodes.duration,
      })
      .from(notifications)
      .leftJoin(episodes, eq(notifications.episodeId, episodes.id))
      .leftJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isDismissed, false),
          validPodcastId !== undefined
            ? eq(podcasts.id, validPodcastId)
            : undefined,
          validSince !== undefined
            ? gte(notifications.createdAt, validSince)
            : undefined
        )
      )
      // id is the deterministic tie-breaker; rows that share a createdAt
      // (common during bulk inserts) would otherwise drift between pages.
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(safeLimit + 1)
      .offset(safeOffset);

    const hasMore = results.length > safeLimit;
    return {
      notifications: hasMore ? results.slice(0, safeLimit) : results,
      hasMore,
      error: null,
    };
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return { notifications: [], hasMore: false, error: "Failed to load notifications" };
  }
}

export async function getUnreadCount(): Promise<number> {
  const { userId } = await auth();
  if (!userId) return 0;

  // Let DB errors propagate so the caller can keep the last good count
  // instead of showing a false "0 unread" after a transient failure.
  const [result] = await db
    .select({ value: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false),
        eq(notifications.isDismissed, false)
      )
    );

  return result?.value ?? 0;
}

export async function markNotificationRead(notificationId: number) {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "You must be signed in" };
  }
  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    return { success: false, error: "Invalid notification id" };
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

export async function dismissNotification(notificationId: number) {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: "You must be signed in" };
  }
  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    return { success: false, error: "Invalid notification id" };
  }

  try {
    const result = await db
      .update(notifications)
      .set({ isDismissed: true })
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
    console.error("Error dismissing notification:", error);
    return { success: false, error: "Failed to dismiss notification" };
  }
}

export async function getEpisodeTopics(
  episodeIds: number[]
): Promise<Record<number, string[]>> {
  const { userId } = await auth();
  const safeEpisodeIds = Array.from(new Set(episodeIds))
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, 100);
  if (!userId || safeEpisodeIds.length === 0) return {};

  try {
    // Restrict to episodes present in the caller's non-dismissed notifications —
    // prevents arbitrary callers from probing topics for episodes they don't own.
    const allowedRows = await db
      .select({ episodeId: notifications.episodeId })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isDismissed, false),
          inArray(notifications.episodeId, safeEpisodeIds)
        )
      );
    const allowedEpisodeIds = Array.from(
      new Set(
        allowedRows
          .map((r) => r.episodeId)
          .filter((id): id is number => id !== null)
      )
    );
    if (allowedEpisodeIds.length === 0) return {};

    const rows = await db
      .select({
        episodeId: episodeTopics.episodeId,
        topic: episodeTopics.topic,
        topicRank: episodeTopics.topicRank,
        relevance: episodeTopics.relevance,
      })
      .from(episodeTopics)
      .where(inArray(episodeTopics.episodeId, allowedEpisodeIds))
      .orderBy(
        sql`${episodeTopics.topicRank} ASC NULLS LAST`,
        desc(episodeTopics.relevance)
      );

    // Plain object rather than Map — Server Action return values travel over
    // the RSC wire and Map is not a reliably serializable shape.
    const byEpisode: Record<number, string[]> = {};
    for (const row of rows) {
      const existing = byEpisode[row.episodeId] ?? [];
      if (existing.length < 3) {
        existing.push(row.topic);
        byEpisode[row.episodeId] = existing;
      }
    }
    return byEpisode;
  } catch (error) {
    console.error("Error fetching episode topics:", error);
    return {};
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
    if (
      prefs.digestFrequency !== undefined &&
      !["realtime", "daily", "weekly"].includes(prefs.digestFrequency)
    ) {
      return { success: false, error: "Invalid digest frequency" };
    }

    if (
      prefs.pushEnabled !== undefined &&
      typeof prefs.pushEnabled !== "boolean"
    ) {
      return { success: false, error: "Invalid pushEnabled value" };
    }

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
