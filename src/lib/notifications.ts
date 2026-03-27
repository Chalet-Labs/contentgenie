import { db } from "@/db";
import {
  notifications,
  users,
  episodes,
  type NewNotification,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { sendPushToUser, consolePushLogger } from "@/lib/push";
import { ROUTES } from "@/lib/routes";

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
    let pushUrl: string = ROUTES.DASHBOARD;
    if (params.episodeId != null) {
      try {
        const episode = await db.query.episodes.findFirst({
          where: eq(episodes.id, params.episodeId),
          columns: { podcastIndexId: true },
        });
        if (episode?.podcastIndexId) {
          pushUrl = ROUTES.episode(episode.podcastIndexId);
        } else {
          console.warn("[notifications] Episode not found for push URL, falling back to dashboard", {
            episodeId: params.episodeId,
          });
        }
      } catch (err) {
        console.error("[notifications] Failed to resolve episode for push URL", {
          episodeId: params.episodeId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    await sendPushToUser(
      params.userId,
      {
        title: params.title,
        body: params.body,
        tag: params.episodeId
          ? `${params.type}-${params.episodeId}`
          : params.type,
        data: { url: pushUrl },
      },
      consolePushLogger
    );
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

  // Resolve PodcastIndex IDs for episodes that will generate a push (skip digest/disabled users)
  const realtimeItems = items.filter((item) => realtimeUsers.has(item.userId));
  const episodeDbIds = Array.from(
    new Set(realtimeItems.map((i) => i.episodeId).filter((id): id is number => id != null))
  );
  const episodePodcastIndexMap = new Map<number, string>();
  if (episodeDbIds.length > 0) {
    try {
      const episodeRows = await db.query.episodes.findMany({
        where: inArray(episodes.id, episodeDbIds),
        columns: { id: true, podcastIndexId: true },
      });
      for (const row of episodeRows) {
        episodePodcastIndexMap.set(row.id, row.podcastIndexId);
      }
      const missing = episodeDbIds.filter((id) => !episodePodcastIndexMap.has(id));
      if (missing.length > 0) {
        console.warn("[notifications] Episodes not found for push URLs, falling back to dashboard", {
          missingEpisodeIds: missing,
        });
      }
    } catch (err) {
      console.error("[notifications] Failed to resolve episodes for push URLs", {
        episodeDbIds,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Dispatch push for realtime users
  await Promise.allSettled(
    realtimeItems.map((item) => {
      const podcastIndexId = item.episodeId != null
        ? episodePodcastIndexMap.get(item.episodeId)
        : undefined;
      const pushUrl = podcastIndexId ? ROUTES.episode(podcastIndexId) : ROUTES.DASHBOARD;
      return sendPushToUser(
        item.userId,
        {
          title: item.title,
          body: item.body,
          tag: item.episodeId
            ? `${item.type}-${item.episodeId}`
            : item.type,
          data: { url: pushUrl },
        },
        consolePushLogger
      );
    })
  );
}
