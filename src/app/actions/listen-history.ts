"use server"

import { auth } from "@clerk/nextjs/server"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { listenHistory } from "@/db/schema"

export async function recordListenEvent(input: {
  episodeId: number
  podcastIndexEpisodeId: number
  started?: boolean
  completed?: boolean
  durationSeconds?: number
}): Promise<{ success: boolean }> {
  const { userId } = await auth()
  if (!userId) return { success: false }

  const { episodeId, podcastIndexEpisodeId, completed, durationSeconds } =
    input

  if (!Number.isInteger(episodeId) || episodeId <= 0) {
    return { success: false }
  }

  try {
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
              ? sql`GREATEST(${listenHistory.listenDurationSeconds}, ${durationSeconds})`
              : sql`${listenHistory.listenDurationSeconds}`,
          updatedAt: now,
        },
      })

    return { success: true }
  } catch {
    return { success: false }
  }
}
