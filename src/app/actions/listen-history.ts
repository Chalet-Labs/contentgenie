"use server";

import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureUserExists } from "@/db/helpers";
import { episodes, listenHistory } from "@/db/schema";
import { auth } from "@clerk/nextjs/server";
import { withAuthAction } from "@/lib/auth-wrapper";
import type { ActionResult } from "@/types/action-result";
import {
  asPodcastIndexEpisodeId,
  type PodcastIndexEpisodeId,
} from "@/types/ids";

export async function recordListenEvent(input: {
  podcastIndexEpisodeId: PodcastIndexEpisodeId;
  completed?: boolean;
  durationSeconds?: number;
}): Promise<ActionResult> {
  const { podcastIndexEpisodeId, completed, durationSeconds } = input;
  const trimmedPodcastIndexEpisodeId =
    typeof podcastIndexEpisodeId === "string"
      ? podcastIndexEpisodeId.trim()
      : undefined;

  if (
    typeof trimmedPodcastIndexEpisodeId !== "string" ||
    trimmedPodcastIndexEpisodeId.length === 0 ||
    (completed !== undefined && typeof completed !== "boolean")
  ) {
    return { success: false, error: "Invalid input" };
  }

  if (
    durationSeconds !== undefined &&
    (!Number.isInteger(durationSeconds) || durationSeconds < 0)
  ) {
    return { success: false, error: "Invalid durationSeconds" };
  }

  // Post-validation cast — input already trimmed and length-checked.
  const brandedEpisodeId = asPodcastIndexEpisodeId(
    trimmedPodcastIndexEpisodeId,
  );

  return withAuthAction(async (userId) => {
    try {
      const episode = await db.query.episodes.findFirst({
        columns: { id: true },
        where: eq(episodes.podcastIndexId, brandedEpisodeId),
      });

      if (!episode) {
        return { success: false, error: "Episode not found" };
      }

      await ensureUserExists(userId);

      const { id: episodeId } = episode;
      const now = new Date();

      await db
        .insert(listenHistory)
        .values({
          userId,
          episodeId,
          podcastIndexEpisodeId: brandedEpisodeId,
          startedAt: now,
          completedAt: completed ? now : null,
          listenDurationSeconds: durationSeconds ?? null,
        })
        .onConflictDoUpdate({
          target: [listenHistory.userId, listenHistory.episodeId],
          set: {
            // Preserve the first listen time (startedAt is NOT NULL, so COALESCE fallback is a safety net only)
            startedAt: sql`COALESCE(${listenHistory.startedAt}, ${now})`,
            // Update completedAt when this is a completion event
            completedAt: completed ? now : sql`${listenHistory.completedAt}`,
            // Keep the longest listen duration
            listenDurationSeconds:
              durationSeconds !== undefined
                ? sql`GREATEST(COALESCE(${listenHistory.listenDurationSeconds}, 0), ${durationSeconds})`
                : sql`${listenHistory.listenDurationSeconds}`,
            updatedAt: now,
          },
        });

      return { success: true };
    } catch (e) {
      console.error("[recordListenEvent] failed", {
        userId,
        podcastIndexEpisodeId: trimmedPodcastIndexEpisodeId,
        completed,
        durationSeconds,
        error: e,
      });
      return { success: false, error: "Failed to record listen event" };
    }
  });
}

// Cap batch lookups to keep the IN predicate bounded even if the client
// forwards an untrusted array (server actions are reachable from the network).
const MAX_LISTENED_LOOKUP_IDS = 500;

// Returns an array (not Set) because server actions serialize across the
// RSC Flight boundary; Set is not serializable on Next.js 14 / React 18 and
// becomes {} on the client. Callers that need O(1) lookup wrap in `new Set()`.
export async function getListenedEpisodeIds(
  episodeInternalIds: number[],
): Promise<number[]> {
  const { userId } = await auth();
  if (!userId || !Array.isArray(episodeInternalIds)) return [];

  const sanitizedIds = Array.from(
    new Set(episodeInternalIds.filter((id) => Number.isInteger(id) && id > 0)),
  ).slice(0, MAX_LISTENED_LOOKUP_IDS);

  if (sanitizedIds.length === 0) return [];

  try {
    // Filter on completedAt: the audio player writes listen_history rows at
    // a playback milestone without setting completedAt, so partial plays
    // must not count as "already listened" for the ListenedButton indicator.
    const rows = await db
      .select({ id: listenHistory.episodeId })
      .from(listenHistory)
      .where(
        and(
          eq(listenHistory.userId, userId),
          inArray(listenHistory.episodeId, sanitizedIds),
          isNotNull(listenHistory.completedAt),
        ),
      );
    return rows.map((r) => r.id);
  } catch (e) {
    console.error("[getListenedEpisodeIds] failed", { userId, error: e });
    return [];
  }
}
