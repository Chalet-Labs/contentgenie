"use server"

import { eq, asc } from "drizzle-orm"
import { db } from "@/db"
import { ensureUserExists } from "@/db/helpers"
import { userQueueItems } from "@/db/schema"
import { withAuthAction } from "@/lib/auth-wrapper"
import {
  queueSchema,
  toAudioEpisode,
  toEpisodeDenormRow,
  type AudioEpisode,
} from "@/lib/schemas/listening-queue"
import type { ActionResult } from "@/types/action-result"

export async function getQueue(): Promise<ActionResult<AudioEpisode[]>> {
  return withAuthAction(async (userId) => {
    try {
      const rows = await db.query.userQueueItems.findMany({
        where: eq(userQueueItems.userId, userId),
        orderBy: [asc(userQueueItems.position)],
      })
      const data: AudioEpisode[] = rows.map(toAudioEpisode)
      return { success: true as const, data }
    } catch (e) {
      console.error("Failed to get queue:", e)
      return { success: false as const, error: "Failed to get queue" }
    }
  })
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
): Promise<ActionResult> {
  return withAuthAction(async (userId) => {
    const parsed = queueSchema.safeParse(episodes)
    if (!parsed.success) {
      console.warn("[setQueue] validation failed", parsed.error.issues)
      return { success: false as const, error: "Invalid queue data" }
    }

    try {
      await ensureUserExists(userId)

      if (parsed.data.length > 0) {
        const updatedAt = new Date()
        const rows = parsed.data.map((ep, index) => ({
          ...toEpisodeDenormRow(ep),
          userId,
          position: index,
          updatedAt,
        }))
        // `drizzle-orm/neon-http` has no interactive transaction support
        // (stateless HTTP driver). `db.batch` ships the statements in a
        // single HTTP round-trip with implicit-transaction semantics, so
        // the DELETE is rolled back if the INSERT fails.
        await db.batch([
          db.delete(userQueueItems).where(eq(userQueueItems.userId, userId)),
          db.insert(userQueueItems).values(rows),
        ])
      } else {
        await db.delete(userQueueItems).where(eq(userQueueItems.userId, userId))
      }

      return { success: true as const }
    } catch (e) {
      console.error("Failed to set queue:", e)
      return { success: false as const, error: "Failed to set queue" }
    }
  })
}

export async function clearQueue(): Promise<ActionResult> {
  return withAuthAction(async (userId) => {
    try {
      await db.delete(userQueueItems).where(eq(userQueueItems.userId, userId))
      return { success: true as const }
    } catch (e) {
      console.error("Failed to clear queue:", e)
      return { success: false as const, error: "Failed to clear queue" }
    }
  })
}
