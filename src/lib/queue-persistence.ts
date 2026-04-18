/**
 * localStorage cache for the listening queue.
 * Source of truth is the server — see `src/app/actions/listening-queue.ts`.
 * This module is write-through cache only: reads hydrate the UI instantly on
 * mount; writes are a best-effort local mirror of the server state.
 */
import type { AudioEpisode } from "@/contexts/audio-player-context"

const STORAGE_KEY = "contentgenie-player-queue"

const REQUIRED_FIELDS: (keyof AudioEpisode)[] = [
  "id",
  "title",
  "podcastTitle",
  "audioUrl",
]

function isValidQueueItem(item: unknown): item is AudioEpisode {
  if (typeof item !== "object" || item === null) return false
  const obj = item as Record<string, unknown>
  if (
    !REQUIRED_FIELDS.every(
      (field) => typeof obj[field] === "string" && obj[field] !== ""
    )
  ) {
    return false
  }
  // Validate optional fields from untrusted localStorage
  if (Object.hasOwn(obj, "artwork") && obj.artwork !== undefined) {
    if (typeof obj.artwork !== "string" || obj.artwork === "") return false
  }
  if (Object.hasOwn(obj, "duration") && obj.duration !== undefined) {
    if (typeof obj.duration !== "number" || !Number.isFinite(obj.duration) || obj.duration < 0) return false
  }
  if (Object.hasOwn(obj, "chaptersUrl") && obj.chaptersUrl !== undefined) {
    if (typeof obj.chaptersUrl !== "string" || obj.chaptersUrl === "") return false
  }
  return true
}

export function loadQueue(): AudioEpisode[] {
  if (typeof window === "undefined") return []

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const validItems = parsed.filter(isValidQueueItem)
    // De-duplicate by ID (keep first occurrence) to prevent dnd-kit key conflicts
    const seen = new Set<string>()
    return validItems.filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
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
