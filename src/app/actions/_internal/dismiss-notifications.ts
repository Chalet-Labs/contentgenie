import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";

export async function dismissNotificationsForEpisodes(
  userId: string,
  episodeIds: number[],
): Promise<number[]> {
  const safeIds = Array.from(
    new Set(episodeIds.filter((id) => Number.isInteger(id) && id > 0)),
  );
  if (safeIds.length === 0) return [];
  try {
    const flipped = await db
      .update(notifications)
      .set({ isDismissed: true })
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.isDismissed, false),
          inArray(notifications.episodeId, safeIds),
        ),
      )
      .returning({ episodeId: notifications.episodeId });
    return Array.from(
      new Set(
        flipped
          .map((r) => r.episodeId)
          .filter((id): id is number => id !== null),
      ),
    );
  } catch (error) {
    console.error("[dismissNotificationsForEpisodes] failed", {
      userId,
      episodeIds: safeIds,
      error,
    });
    return [];
  }
}
