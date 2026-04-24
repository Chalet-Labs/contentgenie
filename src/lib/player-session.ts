/**
 * localStorage cache for the player session (resume position).
 * Source of truth is the server — see `src/app/actions/player-session.ts`.
 * No TTL: the server has no TTL either. `savedAt` is kept for debugging /
 * cache-invalidation telemetry only.
 *
 * Episode validation is delegated to `audioEpisodeSchema` so the cache and
 * the server agree on shape (see ADR-036).
 */
import { z } from "zod";
import {
  audioEpisodeSchema,
  MAX_TIME_SECONDS,
  type AudioEpisode,
} from "@/lib/schemas/listening-queue";

const STORAGE_KEY = "contentgenie-player-session";

const storedSessionSchema = z
  .object({
    episode: audioEpisodeSchema,
    // Cap matches `savePlayerSessionSchema` so a tampered localStorage value
    // can't hydrate locally and then fail the next server sync.
    currentTime: z.number().nonnegative().finite().max(MAX_TIME_SECONDS),
    savedAt: z.number().nonnegative().finite().optional(),
  })
  .strip();

type PlayerSession = z.infer<typeof storedSessionSchema>;

export function loadPlayerSession(): {
  episode: AudioEpisode;
  currentTime: number;
} | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    const result = storedSessionSchema.safeParse(parsed);
    if (!result.success) {
      clearPlayerSession();
      return null;
    }

    return {
      episode: result.data.episode,
      currentTime: result.data.currentTime,
    };
  } catch {
    clearPlayerSession();
    return null;
  }
}

export function savePlayerSession(
  episode: AudioEpisode,
  currentTime: number,
): void {
  if (typeof window === "undefined") return;

  try {
    const session: PlayerSession = {
      episode,
      currentTime,
      savedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // localStorage may be unavailable (e.g. private browsing quota exceeded)
  }
}

export function clearPlayerSession(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // defensive
  }
}
