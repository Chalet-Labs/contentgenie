/**
 * localStorage cache for the player session (resume position).
 * Source of truth is the server — see `src/app/actions/player-session.ts`.
 * No TTL: the server has no TTL either. `savedAt` is kept for debugging /
 * cache-invalidation telemetry only.
 */
import type { AudioEpisode } from "@/contexts/audio-player-context"

const STORAGE_KEY = "contentgenie-player-session"

interface PlayerSession {
  episode: AudioEpisode
  currentTime: number
  savedAt: number
}

function isValidSession(data: unknown): data is PlayerSession {
  if (typeof data !== "object" || data === null) return false
  const obj = data as Record<string, unknown>

  const ep = obj.episode
  if (typeof ep !== "object" || ep === null) return false
  const episode = ep as Record<string, unknown>

  const requiredFields = ["id", "title", "podcastTitle", "audioUrl"] as const
  if (
    !requiredFields.every(
      (field) => typeof episode[field] === "string" && episode[field] !== ""
    )
  ) {
    return false
  }

  if (Object.hasOwn(episode, "artwork") && episode.artwork !== undefined) {
    if (typeof episode.artwork !== "string" || episode.artwork === "") return false
  }
  if (Object.hasOwn(episode, "duration") && episode.duration !== undefined) {
    if (
      typeof episode.duration !== "number" ||
      !Number.isFinite(episode.duration) ||
      episode.duration < 0
    )
      return false
  }
  if (Object.hasOwn(episode, "chaptersUrl") && episode.chaptersUrl !== undefined) {
    if (typeof episode.chaptersUrl !== "string" || episode.chaptersUrl === "")
      return false
  }

  if (
    typeof obj.currentTime !== "number" ||
    !Number.isFinite(obj.currentTime) ||
    obj.currentTime < 0
  ) {
    return false
  }

  if (
    typeof obj.savedAt !== "number" ||
    !Number.isFinite(obj.savedAt) ||
    obj.savedAt <= 0
  ) {
    return false
  }

  return true
}

export function loadPlayerSession(): {
  episode: AudioEpisode
  currentTime: number
} | null {
  if (typeof window === "undefined") return null

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)
    if (!isValidSession(parsed)) {
      clearPlayerSession()
      return null
    }

    return { episode: parsed.episode, currentTime: parsed.currentTime }
  } catch {
    clearPlayerSession()
    return null
  }
}

export function savePlayerSession(
  episode: AudioEpisode,
  currentTime: number
): void {
  if (typeof window === "undefined") return

  try {
    const session: PlayerSession = { episode, currentTime, savedAt: Date.now() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // localStorage may be unavailable (e.g. private browsing quota exceeded)
  }
}

export function clearPlayerSession(): void {
  if (typeof window === "undefined") return

  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // defensive
  }
}
