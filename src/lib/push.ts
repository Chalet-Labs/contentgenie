import webpush from "web-push";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/** RFC 8030 §5.4: Topic header max length (32 URL-safe base64 characters). */
export const TOPIC_MAX_LENGTH = 32;

/** Sanitize a tag for use as an RFC 8030 Topic header: strip non-URL-safe-base64 chars and truncate. */
export function sanitizeTopic(tag: string): string {
  return tag.replace(/[^A-Za-z0-9\-_]/g, "").substring(0, TOPIC_MAX_LENGTH);
}

export interface PushLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export const consolePushLogger: PushLogger = {
  warn: (msg, meta) => console.warn(`[push] ${msg}`, meta ?? ""),
  error: (msg, meta) => console.error(`[push] ${msg}`, meta ?? ""),
};

export interface PushResult {
  sent: number;
  failed: number;
}

let vapidConfigured = false;

function ensureVapidConfigured(): void {
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
 * Send a push notification to all of a user's push subscriptions.
 * Automatically deletes stale subscriptions (404/410).
 * Returns a PushResult with sent and failed counts.
 */
export async function sendPushToUser(
  userId: string,
  payload: {
    title: string;
    body: string;
    tag?: string;
    data?: { url?: string };
  },
  logger: PushLogger = consolePushLogger
): Promise<PushResult> {
  try {
    ensureVapidConfigured();
  } catch (err) {
    logger.warn("VAPID not configured, skipping push", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { sent: 0, failed: 0 };
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
    return { sent: 0, failed: 0 };
  }

  if (subs.length === 0) return { sent: 0, failed: 0 };

  const payloadStr = JSON.stringify(payload);
  const topic = payload.tag ? sanitizeTopic(payload.tag) : undefined;

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
            ...(topic ? { topic } : {}),
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

  let sent = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled") sent++;
    else failed++;
  }
  return { sent, failed };
}
