"use server"

import { auth } from "@clerk/nextjs/server"
import { eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { ensureUserExists } from "@/db/helpers"
import { episodes, listenHistory } from "@/db/schema"

export async function recordListenEvent(input: {
  podcastIndexEpisodeId: string
  completed?: boolean
  durationSeconds?: number
}): Promise<{ success: boolean }> {
  const { userId } = await auth()
  if (!userId) return { success: false }

  const { podcastIndexEpisodeId, completed, durationSeconds } = input

  if (!podcastIndexEpisodeId || typeof podcastIndexEpisodeId !== "string") {
    return { success: false }
  }

  if (
    durationSeconds !== undefined &&
    (!Number.isInteger(durationSeconds) || durationSeconds < 0)
  ) {
    return { success: false }
  }

  try {
    await ensureUserExists(userId)
    const episode = await db.query.episodes.findFirst({
      columns: { id: true },
      where: eq(episodes.podcastIndexId, podcastIndexEpisodeId),
    })

    if (!episode) {
      return { success: false }
    }

    const { id: episodeId } = episode
    const now = new Date()

    await db
      .insert(listenHistory)
      .values({
        userId,
        episodeId,
        podcastIndexEpisodeId,
        startedAt: now,
        completedAt: completed ? now : null,
        listenDurationSeconds: durationSeconds ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [listenHistory.userId, listenHistory.episodeId],
        set: {
          // Preserve the first listen time; only set if currently null
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
    console.error("Failed to record listen event:", e)
    return { success: false }
  }
}
