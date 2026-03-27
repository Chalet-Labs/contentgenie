import { logger } from "@trigger.dev/sdk";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/db";
import { sendPushToUser } from "@/lib/push";
import { ROUTES } from "@/lib/routes";
import {
  notifications,
  userSubscriptions,
  users,
  episodes,
  podcasts,
  type NewNotification,
} from "@/db/schema";

/**
 * Create notifications for all subscribers of a podcast.
 * Looks up subscribers with `notificationsEnabled = true`, inserts
 * notification records, and dispatches push for realtime users.
 *
 * @param podcastId - Internal podcast serial PK (not PodcastIndex ID)
 * @param episodeId - Internal episode serial PK (not PodcastIndex ID); null if episode not yet in DB. Used for notification record FK, not for user-facing URLs.
 * @param type - Notification type
 * @param title - Notification title (e.g., podcast name)
 * @param body - Notification body (e.g., "New episode: ...")
 * @param options - Optional overrides for push behavior
 * @param options.pushTag - Custom notification tag (defaults to `${type}-${episodeId}`)
 * @param options.podcastIndexEpisodeId - PodcastIndex episode ID for push URL; when provided, skips a DB lookup
 */
export async function createNotificationsForSubscribers(
  podcastId: number,
  episodeId: number | null,
  type: "new_episode" | "summary_completed",
  title: string,
  body: string,
  options?: { pushTag?: string; podcastIndexEpisodeId?: string }
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
    // Resolve the PodcastIndex episode ID for push URL construction.
    // Short-circuit when the caller already provides the PodcastIndex ID, avoiding an extra DB round-trip.
    let episodePushUrl: string = ROUTES.DASHBOARD;
    if (options?.podcastIndexEpisodeId) {
      episodePushUrl = ROUTES.episode(options.podcastIndexEpisodeId);
    } else if (episodeId != null) {
      try {
        const episode = await db.query.episodes.findFirst({
          where: eq(episodes.id, episodeId),
          columns: { podcastIndexId: true },
        });
        if (episode?.podcastIndexId) {
          episodePushUrl = ROUTES.episode(episode.podcastIndexId);
        } else {
          logger.warn("Episode not found for push URL, falling back to dashboard", { episodeId });
        }
      } catch (err) {
        logger.error("Failed to resolve episode for push URL", {
          episodeId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await Promise.allSettled(
      realtimeUserIds.map((userId) =>
        sendPushToUser(
          userId,
          {
            title,
            body,
            tag: options?.pushTag ?? (episodeId ? `${type}-${episodeId}` : type),
            data: { url: episodePushUrl },
          },
          logger
        )
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
