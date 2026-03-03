import type { AudioEpisode } from "@/contexts/audio-player-context"

const STORAGE_KEY = "contentgenie-player-queue"

/**
 * Required fields every queue item must have.
 * Items missing any of these are silently dropped.
 */
const REQUIRED_FIELDS: (keyof AudioEpisode)[] = [
  "id",
  "title",
  "podcastTitle",
  "audioUrl",
]

function isValidQueueItem(item: unknown): item is AudioEpisode {
  if (typeof item !== "object" || item === null) return false
  const obj = item as Record<string, unknown>
  return REQUIRED_FIELDS.every(
    (field) => typeof obj[field] === "string" && obj[field] !== ""
  )
}

export function loadQueue(): AudioEpisode[] {
  if (typeof window === "undefined") return []

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.filter(isValidQueueItem)
  } catch {
    return []
  }
}

export function saveQueue(queue: AudioEpisode[]): void {
  if (typeof window === "undefined") return

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  } catch {
    // localStorage may be unavailable (e.g. private browsing quota exceeded)
  }
}
