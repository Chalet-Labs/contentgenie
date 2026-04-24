"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ensureUserExists } from "@/db/helpers";
import { userPlayerSession } from "@/db/schema";
import { withAuthAction } from "@/lib/auth-wrapper";
import {
  savePlayerSessionSchema,
  toAudioEpisode,
  toEpisodeDenormRow,
  type AudioEpisode,
} from "@/lib/schemas/listening-queue";
import type { ActionResult } from "@/types/action-result";

export async function getPlayerSession(): Promise<
  ActionResult<{ episode: AudioEpisode; currentTime: number } | null>
> {
  return withAuthAction(async (userId) => {
    try {
      const row = await db.query.userPlayerSession.findFirst({
        where: eq(userPlayerSession.userId, userId),
      });

      if (!row) return { success: true as const, data: null };

      return {
        success: true as const,
        data: {
          episode: toAudioEpisode(row),
          currentTime: Number(row.currentTime),
        },
      };
    } catch (e) {
      console.error("Failed to get player session:", e);
      return { success: false as const, error: "Failed to get player session" };
    }
  });
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
  currentTime: number,
): Promise<ActionResult> {
  return withAuthAction(async (userId) => {
    const parsed = savePlayerSessionSchema.safeParse({ episode, currentTime });
    if (!parsed.success) {
      console.warn(
        "[savePlayerSession] validation failed",
        parsed.error.issues,
      );
      return { success: false as const, error: "Invalid session data" };
    }

    const { episode: validEpisode, currentTime: validCurrentTime } =
      parsed.data;

    try {
      await ensureUserExists(userId);

      const updateValues = {
        ...toEpisodeDenormRow(validEpisode),
        currentTime: String(validCurrentTime),
        updatedAt: new Date(),
      };

      await db
        .insert(userPlayerSession)
        .values({ userId, ...updateValues })
        .onConflictDoUpdate({
          target: userPlayerSession.userId,
          set: updateValues,
        });

      return { success: true as const };
    } catch (e) {
      console.error("Failed to save player session:", e);
      return {
        success: false as const,
        error: "Failed to save player session",
      };
    }
  });
}

export async function clearPlayerSession(): Promise<ActionResult> {
  return withAuthAction(async (userId) => {
    try {
      await db
        .delete(userPlayerSession)
        .where(eq(userPlayerSession.userId, userId));
      return { success: true as const };
    } catch (e) {
      console.error("Failed to clear player session:", e);
      return {
        success: false as const,
        error: "Failed to clear player session",
      };
    }
  });
}
