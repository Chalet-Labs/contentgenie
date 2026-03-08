import webpush from "web-push";
import { logger } from "@trigger.dev/sdk";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  notifications,
  pushSubscriptions,
  userSubscriptions,
  users,
  podcasts,
  type NewNotification,
} from "@/db/schema";

let vapidConfigured = false;

function ensureVapidConfigured() {
  if (vapidConfigured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "VAPID keys not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT."
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

/**
 * Send push notifications to all of a user's subscriptions.
 * Fire-and-forget: logs errors but never throws.
 */
export async function sendPushToUser(
  userId: string,
  payload: {
    title: string;
    body: string;
    tag?: string;
    data?: { url?: string };
  }
): Promise<number> {
  try {
    ensureVapidConfigured();
  } catch (err) {
    logger.warn("VAPID not configured, skipping push", {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }

  let subs;
  try {
    subs = await db.query.pushSubscriptions.findMany({
      where: eq(pushSubscriptions.userId, userId),
    });
  } catch (err) {
    logger.error("Failed to fetch push subscriptions", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }

  if (subs.length === 0) return 0;

  const payloadStr = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payloadStr,
          {
            TTL: 86400,
            ...(payload.tag ? { topic: payload.tag } : {}),
          }
        );
      } catch (err: unknown) {
        const statusCode =
          err instanceof Object && "statusCode" in err
            ? (err as { statusCode: number }).statusCode
            : undefined;
        if (statusCode === 404 || statusCode === 410) {
          try {
            await db
              .delete(pushSubscriptions)
              .where(
                and(
                  eq(pushSubscriptions.userId, userId),
                  eq(pushSubscriptions.endpoint, sub.endpoint)
                )
              );
          } catch (deleteErr) {
            logger.error("Failed to delete stale push subscription", {
              endpoint: sub.endpoint,
              error:
                deleteErr instanceof Error
                  ? deleteErr.message
                  : String(deleteErr),
            });
          }
        } else {
          logger.warn("Push notification failed", {
            endpoint: sub.endpoint,
            statusCode,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        throw err;
      }
    })
  );

  return results.filter((r) => r.status === "fulfilled").length;
}

/**
 * Create notifications for all subscribers of a podcast.
 * Looks up subscribers with `notificationsEnabled = true`, inserts
 * notification records, and dispatches push for realtime users.
 *
 * @param podcastId - Internal podcast serial PK (not PodcastIndex ID)
 * @param episodeId - Internal episode serial PK (null if episode not yet in DB)
 * @param type - Notification type
 * @param title - Notification title (e.g., podcast name)
 * @param body - Notification body (e.g., "New episode: ...")
 */
export async function createNotificationsForSubscribers(
  podcastId: number,
  episodeId: number | null,
  type: "new_episode" | "summary_completed",
  title: string,
  body: string,
  options?: { pushTag?: string }
): Promise<void> {
  // Find subscribers with notifications enabled
  const subscribers = await db.query.userSubscriptions.findMany({
    where: and(
      eq(userSubscriptions.podcastId, podcastId),
      eq(userSubscriptions.notificationsEnabled, true)
    ),
    columns: { userId: true },
  });

  if (subscribers.length === 0) {
    logger.info("No subscribers with notifications enabled", { podcastId });
    return;
  }

  // Bulk-insert notification records
  const records: NewNotification[] = subscribers.map((sub) => ({
    type,
    userId: sub.userId,
    episodeId,
    title,
    body,
  }));

  await db.insert(notifications).values(records);

  logger.info("Created notifications for subscribers", {
    podcastId,
    episodeId,
    type,
    count: records.length,
  });

  // Determine which users want realtime push
  const userIds = subscribers.map((s) => s.userId);
  const usersWithPrefs = await db.query.users.findMany({
    where: inArray(users.id, userIds),
    columns: { id: true, preferences: true },
  });

  const realtimeUserIds = usersWithPrefs
    .filter((u) => {
      const freq = u.preferences?.digestFrequency ?? "realtime";
      const pushEnabled = u.preferences?.pushEnabled ?? false;
      return pushEnabled && freq === "realtime";
    })
    .map((u) => u.id);

  // Dispatch push for realtime users
  if (realtimeUserIds.length > 0) {
    await Promise.allSettled(
      realtimeUserIds.map((userId) =>
        sendPushToUser(userId, {
          title,
          body,
          tag: options?.pushTag ?? (episodeId ? `${type}-${episodeId}` : type),
          data: {
            url: episodeId ? `/episode/${episodeId}` : "/dashboard",
          },
        })
      )
    );
  }
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
