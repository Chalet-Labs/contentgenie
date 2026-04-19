/**
 * Shared mock factories for server-action tests.
 * File starts with `__` to signal non-test intent and sort before siblings.
 * Kept intentionally small: Vitest hoists `vi.mock(...)` calls to the top of
 * each test module, so mock registration itself must live in each test file.
 * What IS portable: mock-return factories that don't close over file-local
 * variables. Episode fixtures live in `@/test/fixtures/audio-episode`.
 */
import { vi } from "vitest"

export { validEpisode, validEpisode2 } from "@/test/fixtures/audio-episode"

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
