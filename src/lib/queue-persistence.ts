/**
 * localStorage cache for the listening queue.
 * Source of truth is the server — see `src/app/actions/listening-queue.ts`.
 * This module is write-through cache only: reads hydrate the UI instantly on
 * mount; writes are a best-effort local mirror of the server state.
 *
 * Validation is delegated to `audioEpisodeSchema` so the cache and the server
 * agree on shape. An item that fails the cache check would also fail the
 * server Zod — dropping it early prevents a stale localStorage queue from
 * silently failing the migration upload (see ADR-036).
 */
import {
  audioEpisodeSchema,
  MAX_QUEUE_ITEMS,
  type AudioEpisode,
} from "@/lib/schemas/listening-queue"

const STORAGE_KEY = "contentgenie-player-queue"

export function loadQueue(): AudioEpisode[] {
  if (typeof window === "undefined") return []

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const seen = new Set<string>()
    const valid: AudioEpisode[] = []
    for (const item of parsed) {
      const result = audioEpisodeSchema.safeParse(item)
      if (!result.success) continue
      // De-duplicate by ID (keep first occurrence) to prevent dnd-kit key conflicts
      if (seen.has(result.data.id)) continue
      seen.add(result.data.id)
      valid.push(result.data)
      // Stop at the shared server cap — otherwise an oversized local queue
      // would hydrate the UI but fail `setQueue` during migration.
      if (valid.length >= MAX_QUEUE_ITEMS) break
    }
    return valid
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
