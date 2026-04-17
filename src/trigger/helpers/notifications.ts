import { logger } from "@trigger.dev/sdk";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { sendPushToUser } from "@/lib/push";
import { ROUTES } from "@/lib/routes";
import {
  notifications,
  userSubscriptions,
  users,
  podcasts,
  type NewNotification,
} from "@/db/schema";

async function getSubscribers(podcastId: number) {
  return db.query.userSubscriptions.findMany({
    where: and(
      eq(userSubscriptions.podcastId, podcastId),
      eq(userSubscriptions.notificationsEnabled, true)
    ),
    columns: { userId: true },
  });
}

async function getRealtimeUserIds(userIds: string[]) {
  const usersWithPrefs = await db.query.users.findMany({
    where: inArray(users.id, userIds),
    columns: { id: true, preferences: true },
  });
  return usersWithPrefs
    .filter((u) => {
      const freq = u.preferences?.digestFrequency ?? "realtime";
      const pushEnabled = u.preferences?.pushEnabled ?? false;
      return pushEnabled && freq === "realtime";
    })
    .map((u) => u.id);
}

async function dispatchPush(
  userIds: string[],
  title: string,
  body: string,
  tag: string,
  episodePushUrl: string
) {
  if (userIds.length === 0) return;
  await Promise.allSettled(
    userIds.map((userId) =>
      sendPushToUser(userId, { title, body, tag, data: { url: episodePushUrl } }, logger)
    )
  );
}

// Intersect realtime subscribers with the userIds whose rows were actually
// touched by INSERT/UPDATE (.returning()) so we only push for rows that
// changed — avoiding duplicate pushes on conflict and updates to stale rows.
async function realtimePushTargets(
  subscriberIds: string[],
  affectedRows: { userId: string }[]
): Promise<string[]> {
  const affected = new Set(affectedRows.map((r) => r.userId));
  const realtime = await getRealtimeUserIds(subscriberIds);
  return realtime.filter((id) => affected.has(id));
}

const episodeTag = (episodeId: number) => `episode-${episodeId}`;

/**
 * INSERT a notification row per subscriber on episode discovery.
 * Uses onConflictDoNothing so poller retries are safe.
 */
export async function createEpisodeNotifications(
  podcastId: number,
  episodeId: number,
  podcastIndexEpisodeId: string,
  title: string,
  body: string
): Promise<void> {
  const subscribers = await getSubscribers(podcastId);

  if (subscribers.length === 0) {
    logger.info("No subscribers with notifications enabled", { podcastId });
    return;
  }

  const records: NewNotification[] = subscribers.map((sub) => ({
    type: "new_episode" as const,
    userId: sub.userId,
    episodeId,
    title,
    body,
  }));

  // `where` predicate mirrors the partial unique index (drizzle/0019):
  // `UNIQUE (user_id, episode_id) WHERE episode_id IS NOT NULL AND type = 'new_episode'`.
  // Postgres requires an explicit `index_predicate` to infer a partial index as
  // the conflict arbiter — without it, ON CONFLICT raises at runtime.
  // The `type = 'new_episode'` scope also lets legacy `summary_completed` rows
  // coexist with the new single-row model without tripping the unique index.
  const insertedRows = await db
    .insert(notifications)
    .values(records)
    .onConflictDoNothing({
      target: [notifications.userId, notifications.episodeId],
      where: sql`${notifications.episodeId} is not null and ${notifications.type} = 'new_episode'`,
    })
    .returning({ userId: notifications.userId });

  logger.info("Created episode notifications for subscribers", {
    podcastId,
    episodeId,
    intended: records.length,
    inserted: insertedRows.length,
  });

  if (insertedRows.length === 0) return;

  const subscriberIds = subscribers.map((s) => s.userId);
  const targets = await realtimePushTargets(subscriberIds, insertedRows);

  await dispatchPush(
    targets,
    title,
    body,
    episodeTag(episodeId),
    ROUTES.episode(podcastIndexEpisodeId)
  );
}

/**
 * UPDATE the existing notification row when the summary lands.
 * No-ops silently when no prior row exists (admin-triggered re-summarization).
 */
export async function markSummaryReady(
  podcastId: number,
  episodeId: number,
  podcastIndexEpisodeId: string,
  title: string,
  body: string
): Promise<void> {
  const subscribers = await getSubscribers(podcastId);

  if (subscribers.length === 0) {
    logger.info("No subscribers with notifications enabled", { podcastId });
    return;
  }

  const subscriberIds = subscribers.map((s) => s.userId);

  // `type = 'new_episode'` filter scopes the UPDATE to single-row-model rows
  // only. Without it, admin re-summarization would reset `isRead` on legacy
  // `summary_completed` rows, inflating unread counts.
  const updatedRows = await db
    .update(notifications)
    .set({ body, title, isRead: false })
    .where(
      and(
        eq(notifications.episodeId, episodeId),
        eq(notifications.type, "new_episode"),
        inArray(notifications.userId, subscriberIds)
      )
    )
    .returning({ userId: notifications.userId });

  if (updatedRows.length === 0) {
    logger.info("markSummaryReady: no existing notification rows to update — no-op", {
      podcastId,
      episodeId,
    });
    return;
  }

  logger.info("Updated summary notifications", {
    podcastId,
    episodeId,
    count: updatedRows.length,
  });

  const targets = await realtimePushTargets(subscriberIds, updatedRows);

  await dispatchPush(
    targets,
    title,
    body,
    episodeTag(episodeId),
    ROUTES.episode(podcastIndexEpisodeId)
  );
}

/**
 * Resolve a PodcastIndex feed ID to an internal podcast serial PK.
 */
export async function resolvePodcastId(
  podcastIndexId: string | number
): Promise<number | null> {
  const podcast = await db.query.podcasts.findFirst({
    where: eq(podcasts.podcastIndexId, String(podcastIndexId)),
    columns: { id: true },
  });
  return podcast?.id ?? null;
}
