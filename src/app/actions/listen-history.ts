"use server"

import { eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { ensureUserExists } from "@/db/helpers"
import { episodes, listenHistory } from "@/db/schema"
import { withAuthAction } from "@/lib/auth-wrapper"
import type { ActionResult } from "@/types/action-result"

export async function recordListenEvent(input: {
  podcastIndexEpisodeId: string
  completed?: boolean
  durationSeconds?: number
}): Promise<ActionResult> {
  const { podcastIndexEpisodeId, completed, durationSeconds } = input
  const trimmedPodcastIndexEpisodeId =
    typeof podcastIndexEpisodeId === "string"
      ? podcastIndexEpisodeId.trim()
      : undefined

  if (
    typeof trimmedPodcastIndexEpisodeId !== "string" ||
    trimmedPodcastIndexEpisodeId.length === 0 ||
    (completed !== undefined && typeof completed !== "boolean")
  ) {
    return { success: false, error: "Invalid input" }
  }

  if (
    durationSeconds !== undefined &&
    (!Number.isInteger(durationSeconds) || durationSeconds < 0)
  ) {
    return { success: false, error: "Invalid durationSeconds" }
  }

  return withAuthAction(async (userId) => {
    try {
      const episode = await db.query.episodes.findFirst({
        columns: { id: true },
        where: eq(episodes.podcastIndexId, trimmedPodcastIndexEpisodeId),
      })

      if (!episode) {
        return { success: false, error: "Episode not found" }
      }

      await ensureUserExists(userId)

      const { id: episodeId } = episode
      const now = new Date()

      await db
        .insert(listenHistory)
        .values({
          userId,
          episodeId,
          podcastIndexEpisodeId: trimmedPodcastIndexEpisodeId,
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
            completedAt: completed
              ? now
              : sql`${listenHistory.completedAt}`,
            // Keep the longest listen duration
            listenDurationSeconds:
              durationSeconds !== undefined
                ? sql`GREATEST(COALESCE(${listenHistory.listenDurationSeconds}, 0), ${durationSeconds})`
                : sql`${listenHistory.listenDurationSeconds}`,
            updatedAt: now,
          },
        })

      return { success: true }
    } catch (e) {
      console.error("[recordListenEvent] failed", {
        userId,
        podcastIndexEpisodeId: trimmedPodcastIndexEpisodeId,
        completed,
        durationSeconds,
        error: e,
      })
      return { success: false, error: "Failed to record listen event" }
    }
  })
}
