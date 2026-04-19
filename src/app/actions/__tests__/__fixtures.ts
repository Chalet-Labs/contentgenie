/**
 * Shared mock factories for server-action tests.
 * File starts with `__` to signal non-test intent and sort before siblings.
 * Kept intentionally small: Vitest hoists `vi.mock(...)` calls to the top of
 * each test module, so mock registration itself must live in each test file.
 * Helper factories here are safe to reference from inside a `vi.mock(..., () => …)`
 * factory because that factory runs lazily (at first `import(...)` of the
 * mocked module), by which time ESM imports have resolved.
 * Episode fixtures live in `@/test/fixtures/audio-episode`.
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

/**
 * Build a 2-level chain: `db.insert(table).values(rows)`.
 * `values()` returns whatever `valuesSpy` returns (usually a resolved Promise).
 */
export function makeInsertChain(
  insertSpy: (...args: unknown[]) => void,
  valuesSpy: (...args: unknown[]) => unknown,
) {
  return (...args: unknown[]) => {
    insertSpy(...args)
    return {
      values: (...vArgs: unknown[]) => valuesSpy(...vArgs),
    }
  }
}

/**
 * Build a 3-level chain: `db.insert(table).values(rows).onConflictDoUpdate(opts)`.
 * `valuesSpy` is called for argument tracking; its return value is discarded
 * in favor of the next-level wrapper. `onConflictSpy`'s return is returned.
 */
export function makeInsertConflictChain(
  insertSpy: (...args: unknown[]) => void,
  valuesSpy: (...args: unknown[]) => void,
  onConflictSpy: (opts: unknown) => unknown,
) {
  return (...args: unknown[]) => {
    insertSpy(...args)
    return {
      values: (...vArgs: unknown[]) => {
        valuesSpy(...vArgs)
        return {
          onConflictDoUpdate: (opts: unknown) => onConflictSpy(opts),
        }
      },
    }
  }
}

/** Build a 2-level chain: `db.delete(table).where(predicate)`. */
export function makeDeleteChain(
  deleteSpy: (...args: unknown[]) => void,
  whereSpy: (...args: unknown[]) => unknown,
) {
  return (...args: unknown[]) => {
    deleteSpy(...args)
    return {
      where: (...wArgs: unknown[]) => whereSpy(...wArgs),
    }
  }
}
