import { schedules, logger } from "@trigger.dev/sdk";
import { eq, and, gt, count, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, notifications } from "@/db/schema";
import { sendPushToUser } from "@/lib/push";

// Digest thresholds (sub-period to avoid drift)
const DAILY_THRESHOLD_MS = 23 * 60 * 60 * 1000; // 23 hours
const WEEKLY_THRESHOLD_MS = 6.5 * 24 * 60 * 60 * 1000; // 6.5 days

/**
 * Scheduled task that sends digest push notifications.
 * Runs hourly, queries users with daily/weekly digest preference,
 * and sends a batched push for users with unread notifications.
 */
export const sendNotificationDigests = schedules.task({
  id: "send-notification-digests",
  cron: "0 * * * *", // Every hour
  maxDuration: 120,
  retry: { maxAttempts: 2 },
  run: async () => {
    logger.info("Starting notification digest run");

    // Query users who have a daily or weekly digest preference.
    // The preferences column is json (not jsonb), so we use raw SQL extraction.
    const digestUsers = await db
      .select({
        id: users.id,
        preferences: users.preferences,
      })
      .from(users)
      .where(
        sql`${users.preferences}->>'digestFrequency' IN ('daily', 'weekly')
            AND COALESCE(${users.preferences}->>'pushEnabled', 'false') = 'true'`
      );

    logger.info("Found users with digest preferences", {
      count: digestUsers.length,
    });

    if (digestUsers.length === 0) {
      return { usersProcessed: 0, digestsSent: 0 };
    }

    let digestsSent = 0;
    const now = new Date();

    for (const user of digestUsers) {
      try {
        const prefs = user.preferences;
        if (prefs?.pushEnabled !== true) continue;
        const frequency = prefs?.digestFrequency;
        const lastDigest = prefs?.lastDigestSentAt
          ? new Date(prefs.lastDigestSentAt)
          : null;

        // Check if enough time has elapsed since last digest
        const thresholdMs =
          frequency === "daily" ? DAILY_THRESHOLD_MS : WEEKLY_THRESHOLD_MS;

        if (lastDigest && now.getTime() - lastDigest.getTime() < thresholdMs) {
          continue; // Not time yet for this user
        }

        // Count unread notifications since last digest (or all time if first digest)
        const sinceDate = lastDigest ?? new Date(0);
        const [result] = await db
          .select({ value: count() })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, user.id),
              eq(notifications.isRead, false),
              gt(notifications.createdAt, sinceDate)
            )
          );

        const unreadCount = result?.value ?? 0;
        if (unreadCount === 0) continue;

        // Send digest push
        const pushResult = await sendPushToUser(
          user.id,
          {
            title: "ContentGenie Digest",
            body: `You have ${unreadCount} new update${unreadCount === 1 ? "" : "s"}`,
            tag: "digest",
            data: { url: "/dashboard" },
          },
          logger
        );

        // Skip advancement only when push was attempted but none succeeded
        // (e.g. transient network errors). When sent+failed are both 0
        // (no subscriptions or VAPID unconfigured), advance to prevent
        // infinite reprocessing of unreachable users.
        if (pushResult.sent === 0 && pushResult.failed > 0) continue;

        // Update lastDigestSentAt using read-modify-write
        const currentPrefs = prefs ?? {};
        const updatedPrefs = {
          ...currentPrefs,
          lastDigestSentAt: now.toISOString(),
        };

        await db
          .update(users)
          .set({ preferences: updatedPrefs, updatedAt: now })
          .where(eq(users.id, user.id));

        digestsSent++;

        logger.info("Sent digest to user", {
          userId: user.id,
          unreadCount,
          frequency,
        });
      } catch (err) {
        logger.error("Failed to process digest for user", {
          userId: user.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const summary = {
      usersProcessed: digestUsers.length,
      digestsSent,
    };

    logger.info("Digest run complete", summary);
    return summary;
  },
});
