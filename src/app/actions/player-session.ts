"use server"

import { auth } from "@clerk/nextjs/server"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { ensureUserExists } from "@/db/helpers"
import { userPlayerSession } from "@/db/schema"
import {
  savePlayerSessionSchema,
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

    const episode: AudioEpisode = {
      id: row.episodeId,
      title: row.title,
      podcastTitle: row.podcastTitle,
      audioUrl: row.audioUrl,
    }
    if (row.artwork != null) episode.artwork = row.artwork
    if (row.duration != null) episode.duration = row.duration
    if (row.chaptersUrl != null) episode.chaptersUrl = row.chaptersUrl

    return {
      success: true,
      data: { episode, currentTime: Number(row.currentTime) },
    }
  } catch (e) {
    console.error("Failed to get player session:", e)
    return { success: false, error: "Failed to get player session" }
  }
}

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

    await db
      .insert(userPlayerSession)
      .values({
        userId,
        episodeId: validEpisode.id,
        title: validEpisode.title,
        podcastTitle: validEpisode.podcastTitle,
        audioUrl: validEpisode.audioUrl,
        artwork: validEpisode.artwork ?? null,
        duration: validEpisode.duration ?? null,
        chaptersUrl: validEpisode.chaptersUrl ?? null,
        currentTime: String(validCurrentTime),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userPlayerSession.userId,
        set: {
          episodeId: validEpisode.id,
          title: validEpisode.title,
          podcastTitle: validEpisode.podcastTitle,
          audioUrl: validEpisode.audioUrl,
          artwork: validEpisode.artwork ?? null,
          duration: validEpisode.duration ?? null,
          chaptersUrl: validEpisode.chaptersUrl ?? null,
          currentTime: String(validCurrentTime),
          updatedAt: new Date(),
        },
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
