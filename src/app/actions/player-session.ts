"use server"

import { auth } from "@clerk/nextjs/server"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { ensureUserExists } from "@/db/helpers"
import { userPlayerSession } from "@/db/schema"
import {
  savePlayerSessionSchema,
  toAudioEpisode,
  type AudioEpisode,
} from "@/lib/schemas/listening-queue"

export async function getPlayerSession(): Promise<
  | { success: true; data: { episode: AudioEpisode; currentTime: number } | null }
  | { success: false; error: string }
> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: "Unauthorized" }

  try {
    const row = await db.query.userPlayerSession.findFirst({
      where: eq(userPlayerSession.userId, userId),
    })

    if (!row) return { success: true, data: null }

    return {
      success: true,
      data: {
        episode: toAudioEpisode(row),
        currentTime: Number(row.currentTime),
      },
    }
  } catch (e) {
    console.error("Failed to get player session:", e)
    return { success: false, error: "Failed to get player session" }
  }
}

/**
 * Upserts the per-user resume-position row. Client is expected to throttle
 * calls (~5s) so we are not hammering Neon on every `timeupdate` tick.
 *
 * Conflict strategy is last-write-wins on the row — per ADR-036. Two devices
 * writing concurrently resolve to whichever `savePlayerSession` commits last.
 * The context's `never-rewind-active-playback` guard prevents the losing
 * write's stale `currentTime` from ever being applied on the still-playing
 * device.
 */
export async function savePlayerSession(
  episode: AudioEpisode,
  currentTime: number
): Promise<{ success: true } | { success: false; error: string }> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: "Unauthorized" }

  const parsed = savePlayerSessionSchema.safeParse({ episode, currentTime })
  if (!parsed.success) {
    console.warn("[savePlayerSession] validation failed", parsed.error.issues)
    return { success: false, error: "Invalid session data" }
  }

  const { episode: validEpisode, currentTime: validCurrentTime } = parsed.data

  try {
    await ensureUserExists(userId)

    const updateValues = {
      episodeId: validEpisode.id,
      title: validEpisode.title,
      podcastTitle: validEpisode.podcastTitle,
      audioUrl: validEpisode.audioUrl,
      artwork: validEpisode.artwork ?? null,
      duration: validEpisode.duration ?? null,
      chaptersUrl: validEpisode.chaptersUrl ?? null,
      currentTime: String(validCurrentTime),
      updatedAt: new Date(),
    }

    await db
      .insert(userPlayerSession)
      .values({ userId, ...updateValues })
      .onConflictDoUpdate({
        target: userPlayerSession.userId,
        set: updateValues,
      })

    return { success: true }
  } catch (e) {
    console.error("Failed to save player session:", e)
    return { success: false, error: "Failed to save player session" }
  }
}

export async function clearPlayerSession(): Promise<
  { success: true } | { success: false; error: string }
> {
  const { userId } = await auth()
  if (!userId) return { success: false, error: "Unauthorized" }

  try {
    await db
      .delete(userPlayerSession)
      .where(eq(userPlayerSession.userId, userId))
    return { success: true }
  } catch (e) {
    console.error("Failed to clear player session:", e)
    return { success: false, error: "Failed to clear player session" }
  }
}
