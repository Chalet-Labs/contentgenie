import type { AudioEpisode } from "@/contexts/audio-player-context"

const STORAGE_KEY = "contentgenie-player-session"
const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface PlayerSession {
  episode: AudioEpisode
  currentTime: number
  savedAt: number
}

function isValidSession(data: unknown): data is PlayerSession {
  if (typeof data !== "object" || data === null) return false
  const obj = data as Record<string, unknown>

  // Validate episode
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

  // Validate optional episode fields
  if ("artwork" in episode && episode.artwork !== undefined) {
    if (typeof episode.artwork !== "string" || episode.artwork === "") return false
  }
  if ("duration" in episode && episode.duration !== undefined) {
    if (
      typeof episode.duration !== "number" ||
      !Number.isFinite(episode.duration) ||
      episode.duration < 0
    )
      return false
  }
  if ("chaptersUrl" in episode && episode.chaptersUrl !== undefined) {
    if (typeof episode.chaptersUrl !== "string" || episode.chaptersUrl === "")
      return false
  }

  // Validate currentTime
  if (
    typeof obj.currentTime !== "number" ||
    !Number.isFinite(obj.currentTime) ||
    obj.currentTime < 0
  ) {
    return false
  }

  // Validate savedAt
  if (
    typeof obj.savedAt !== "number" ||
    !Number.isFinite(obj.savedAt) ||
    obj.savedAt <= 0
  ) {
    return false
  }

  // TTL check
  if (Date.now() - obj.savedAt >= SESSION_TTL_MS) return false

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
