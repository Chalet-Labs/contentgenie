import webpush from "web-push";
import { db } from "@/db";
import {
  notifications,
  pushSubscriptions,
  users,
  type NewNotification,
} from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

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

async function getNotificationPrefs(
  userId: string
): Promise<{
  digestFrequency: "realtime" | "daily" | "weekly";
  pushEnabled: boolean;
}> {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { preferences: true },
    });
    return {
      digestFrequency: user?.preferences?.digestFrequency ?? "realtime",
      pushEnabled: user?.preferences?.pushEnabled ?? false,
    };
  } catch {
    // Fail closed: keep notification write successful, skip push decision
    return { digestFrequency: "realtime", pushEnabled: false };
  }
}

/**
 * Send a push notification to all of a user's push subscriptions.
 * Fire-and-forget: logs errors but never throws.
 * Automatically deletes stale subscriptions (404/410).
 */
export async function sendPushToUser(
  userId: string,
  payload: {
    title: string;
    body: string;
    tag?: string;
    data?: { url?: string };
  }
): Promise<void> {
  try {
    ensureVapidConfigured();
  } catch (err) {
    console.error("[notifications] VAPID not configured:", err);
    return;
  }

  let subs;
  try {
    subs = await db.query.pushSubscriptions.findMany({
      where: eq(pushSubscriptions.userId, userId),
    });
  } catch (err) {
    console.error("[notifications] Failed to fetch push subscriptions:", err);
    return;
  }

  const payloadStr = JSON.stringify(payload);

  await Promise.allSettled(
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
          // Subscription expired — clean up
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
            console.error(
              "[notifications] Failed to delete stale subscription:",
              deleteErr
            );
          }
        } else {
          const endpointHint = `${sub.endpoint.slice(0, 20)}…${sub.endpoint.slice(-8)}`;
          console.error("[notifications] Push failed", {
            endpoint: endpointHint,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })
  );
}

/**
 * Create a single notification and optionally dispatch a push
 * if the user's digest preference is "realtime".
 */
export async function createNotification(params: {
  type: "new_episode" | "summary_completed";
  userId: string;
  episodeId?: number;
  title: string;
  body: string;
}): Promise<void> {
  const record: NewNotification = {
    type: params.type,
    userId: params.userId,
    episodeId: params.episodeId ?? null,
    title: params.title,
    body: params.body,
  };

  await db.insert(notifications).values(record);

  const preference = await getNotificationPrefs(params.userId);
  if (preference.pushEnabled && preference.digestFrequency === "realtime") {
    await sendPushToUser(params.userId, {
      title: params.title,
      body: params.body,
      tag: params.episodeId
        ? `${params.type}-${params.episodeId}`
        : params.type,
      data: {
        url: params.episodeId ? `/episode/${params.episodeId}` : "/dashboard",
      },
    });
  }
}

/**
 * Create notifications in bulk (e.g., for all subscribers of a podcast).
 * Dispatches push for users with realtime digest preference.
 */
export async function createBulkNotifications(
  items: Array<{
    type: "new_episode" | "summary_completed";
    userId: string;
    episodeId?: number;
    title: string;
    body: string;
  }>
): Promise<void> {
  if (items.length === 0) return;

  const records: NewNotification[] = items.map((item) => ({
    type: item.type,
    userId: item.userId,
    episodeId: item.episodeId ?? null,
    title: item.title,
    body: item.body,
  }));

  await db.insert(notifications).values(records);

  // Gather unique user IDs and batch-fetch their digest preferences (single query)
  const userIds = Array.from(new Set(items.map((i) => i.userId)));
  const realtimeUsers = new Set<string>();

  if (userIds.length > 0) {
    const usersWithPrefs = await db.query.users.findMany({
      where: inArray(users.id, userIds),
      columns: { id: true, preferences: true },
    });

    for (const user of usersWithPrefs) {
      const pushEnabled = user.preferences?.pushEnabled ?? false;
      const digestFrequency = user.preferences?.digestFrequency ?? "realtime";
      if (pushEnabled && digestFrequency === "realtime") {
        realtimeUsers.add(user.id);
      }
    }
  }

  // Dispatch push for realtime users
  await Promise.allSettled(
    items
      .filter((item) => realtimeUsers.has(item.userId))
      .map((item) =>
        sendPushToUser(item.userId, {
          title: item.title,
          body: item.body,
          tag: item.episodeId
            ? `${item.type}-${item.episodeId}`
            : item.type,
          data: {
            url: item.episodeId
              ? `/episode/${item.episodeId}`
              : "/dashboard",
          },
        })
      )
  );
}
