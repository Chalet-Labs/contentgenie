import { describe, it, expect, beforeEach } from "vitest"
import { loadQueue, saveQueue } from "@/lib/queue-persistence"
import type { AudioEpisode } from "@/contexts/audio-player-context"
import {
  installLocalStorageMock,
  installQuotaExceededLocalStorage,
  withoutWindow,
} from "@/test/mocks/local-storage"
import { validEpisode, validEpisode2 } from "@/test/fixtures/audio-episode"

describe("loadQueue", () => {
  beforeEach(() => {
    installLocalStorageMock()
  })

  it("returns empty array when nothing stored", () => {
    expect(loadQueue()).toEqual([])
  })

  it("returns valid queue data", () => {
    window.localStorage.setItem(
      "contentgenie-player-queue",
      JSON.stringify([validEpisode, validEpisode2])
    )
    const result = loadQueue()
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe("ep-1")
    expect(result[1].id).toBe("ep-2")
  })

  it("deduplicates items with the same ID", () => {
    const duplicate: AudioEpisode = {
      ...validEpisode,
      title: "Duplicate of ep-1",
    }
    window.localStorage.setItem(
      "contentgenie-player-queue",
      JSON.stringify([validEpisode, duplicate, validEpisode2])
    )
    const result = loadQueue()
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe("ep-1")
    expect(result[0].title).toBe("Test Episode") // keeps first occurrence
    expect(result[1].id).toBe("ep-2")
  })

  it("returns empty array for corrupted JSON", () => {
    window.localStorage.setItem(
      "contentgenie-player-queue",
      "not valid json{{{"
    )
    expect(loadQueue()).toEqual([])
  })

  it("returns empty array for non-array JSON", () => {
    window.localStorage.setItem(
      "contentgenie-player-queue",
      JSON.stringify({ id: "ep-1" })
    )
    expect(loadQueue()).toEqual([])
  })

  it("filters out items missing required fields", () => {
    const items = [
      validEpisode,
      { id: "ep-bad", title: "Missing audioUrl" },
      validEpisode2,
    ]
    window.localStorage.setItem(
      "contentgenie-player-queue",
      JSON.stringify(items)
    )
    const result = loadQueue()
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe("ep-1")
    expect(result[1].id).toBe("ep-2")
  })

  it("filters out items with empty string required fields", () => {
    const items = [{ ...validEpisode, audioUrl: "" }]
    window.localStorage.setItem(
      "contentgenie-player-queue",
      JSON.stringify(items)
    )
    expect(loadQueue()).toEqual([])
  })

  it("accepts items with a valid chaptersUrl string", () => {
    const withChapters: AudioEpisode = {
      ...validEpisode,
      chaptersUrl: "https://example.com/chapters.json",
    }
    window.localStorage.setItem(
      "contentgenie-player-queue",
      JSON.stringify([withChapters])
    )
    const result = loadQueue()
    expect(result).toHaveLength(1)
    expect(result[0].chaptersUrl).toBe("https://example.com/chapters.json")
  })

  it("filters out items with empty-string chaptersUrl", () => {
    const items = [{ ...validEpisode, chaptersUrl: "" }]
    window.localStorage.setItem(
      "contentgenie-player-queue",
      JSON.stringify(items)
    )
    expect(loadQueue()).toEqual([])
  })

  it("filters out items with non-string chaptersUrl", () => {
    const items = [{ ...validEpisode, chaptersUrl: 42 }]
    window.localStorage.setItem(
      "contentgenie-player-queue",
      JSON.stringify(items)
    )
    expect(loadQueue()).toEqual([])
  })

  it("filters out null items in the array", () => {
    const items = [null, validEpisode, undefined, 42, "string"]
    window.localStorage.setItem(
      "contentgenie-player-queue",
      JSON.stringify(items)
    )
    const result = loadQueue()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("ep-1")
  })

  it("returns empty array in SSR environment", () => {
    withoutWindow(() => {
      expect(loadQueue()).toEqual([])
    })
  })
})

describe("saveQueue", () => {
  beforeEach(() => {
    installLocalStorageMock()
  })

  it("saves queue to localStorage", () => {
    saveQueue([validEpisode])
    const stored = window.localStorage.getItem("contentgenie-player-queue")
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe("ep-1")
  })

  it("saves empty array", () => {
    saveQueue([])
    const stored = window.localStorage.getItem("contentgenie-player-queue")
    expect(stored).toBe("[]")
  })

  it("handles quota exceeded error gracefully", () => {
    installQuotaExceededLocalStorage()
    expect(() => saveQueue([validEpisode])).not.toThrow()
  })

  it("does nothing in SSR environment", () => {
    withoutWindow(() => {
      expect(() => saveQueue([validEpisode])).not.toThrow()
    })
  })
})
