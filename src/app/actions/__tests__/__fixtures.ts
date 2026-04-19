/**
 * Shared fixtures + pure mock factories for server-action tests.
 * File starts with `__` to signal non-test intent and sort before siblings.
 * Kept intentionally small: Vitest hoists `vi.mock(...)` calls to the top of
 * each test module, so mock registration itself must live in each test file.
 * What IS portable: fixture data, and mock-return factories that don't close
 * over file-local variables.
 */
import { vi } from "vitest"
import type { AudioEpisode } from "@/contexts/audio-player-context"

export const validEpisode: AudioEpisode = {
  id: "ep-1",
  title: "Test Episode",
  podcastTitle: "Test Podcast",
  audioUrl: "https://example.com/audio.mp3",
  artwork: "https://example.com/art.jpg",
  duration: 600,
}

export const validEpisode2: AudioEpisode = {
  id: "ep-2",
  title: "Test Episode 2",
  podcastTitle: "Test Podcast",
  audioUrl: "https://example.com/audio2.mp3",
}

/**
 * Factory for the `drizzle-orm` mock. Pure (no closure over file-local vars),
 * so it's safe to call from inside a `vi.mock("drizzle-orm", () => …)` factory.
 */
export function createDrizzleOrmMock() {
  return {
    eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
    asc: vi.fn((col: unknown) => ({ col, direction: "asc" })),
  }
}
