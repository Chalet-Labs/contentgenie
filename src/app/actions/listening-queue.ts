"use server"

import { auth } from "@clerk/nextjs/server"
import { eq, asc } from "drizzle-orm"
import { db } from "@/db"
import { ensureUserExists } from "@/db/helpers"
import { userQueueItems } from "@/db/schema"
import {
  queueSchema,
  toAudioEpisode,
  toEpisodeDenormRow,
  type AudioEpisode,
} from "@/lib/schemas/listening-queue"

export async function getQueue(): Promise<
  { success: true; data: AudioEpisode[] } | { success: false; error: string }
> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: "Unauthorized" }

  try {
    const rows = await db.query.userQueueItems.findMany({
      where: eq(userQueueItems.userId, userId),
      orderBy: [asc(userQueueItems.position)],
    })

    const data: AudioEpisode[] = rows.map(toAudioEpisode)

    return { success: true, data }
  } catch (e) {
    console.error("Failed to get queue:", e)
    return { success: false, error: "Failed to get queue" }
  }
}

/**
 * Replaces the entire queue for the authenticated user with the provided
 * array. There is no `addToQueue` / `removeFromQueue` partial-update action
 * by design: atomic replace-all eliminates ordering races between concurrent
 * optimistic mutations. Positions are derived from array index. Passing an
 * empty array is equivalent to `clearQueue`.
 *
 * Conflict strategy is last-commit-wins. No version token, no merge — per
 * ADR-036. Two devices mutating concurrently will resolve to whichever
 * commit arrives last on the database.
 */
export async function setQueue(
  episodes: AudioEpisode[]
): Promise<{ success: true } | { success: false; error: string }> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: "Unauthorized" }

  const parsed = queueSchema.safeParse(episodes)
  if (!parsed.success) {
    console.warn("[setQueue] validation failed", parsed.error.issues)
    return { success: false, error: "Invalid queue data" }
  }

  try {
    await ensureUserExists(userId)

    await db.transaction(async (tx) => {
      await tx.delete(userQueueItems).where(eq(userQueueItems.userId, userId))

      if (parsed.data.length > 0) {
        const rows = parsed.data.map((ep, index) => ({
          userId,
          position: index,
          ...toEpisodeDenormRow(ep),
          updatedAt: new Date(),
        }))
        await tx.insert(userQueueItems).values(rows)
      }
    })

    return { success: true }
  } catch (e) {
    console.error("Failed to set queue:", e)
    return { success: false, error: "Failed to set queue" }
  }
}

export async function clearQueue(): Promise<
  { success: true } | { success: false; error: string }
> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: "Unauthorized" }

  try {
    await db.delete(userQueueItems).where(eq(userQueueItems.userId, userId))
    return { success: true }
  } catch (e) {
    console.error("Failed to clear queue:", e)
    return { success: false, error: "Failed to clear queue" }
  }
}
