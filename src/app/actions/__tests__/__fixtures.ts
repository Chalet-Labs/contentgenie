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
import { expect, vi } from "vitest";

type MockFn = ReturnType<typeof vi.fn>;

export { validEpisode, validEpisode2 } from "@/test/fixtures/audio-episode";

/**
 * Factory for the `drizzle-orm` mock. Pure (no closure over file-local vars),
 * so it's safe to call from inside a `vi.mock("drizzle-orm", () => …)` factory.
 */
export function createDrizzleOrmMock() {
  return {
    eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
    asc: vi.fn((col: unknown) => ({ col, direction: "asc" })),
  };
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
    insertSpy(...args);
    return {
      values: (...vArgs: unknown[]) => valuesSpy(...vArgs),
    };
  };
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
    insertSpy(...args);
    return {
      values: (...vArgs: unknown[]) => {
        valuesSpy(...vArgs);
        return {
          onConflictDoUpdate: (opts: unknown) => onConflictSpy(opts),
        };
      },
    };
  };
}

/** Build a 2-level chain: `db.delete(table).where(predicate)`. */
export function makeDeleteChain(
  deleteSpy: (...args: unknown[]) => void,
  whereSpy: (...args: unknown[]) => unknown,
) {
  return (...args: unknown[]) => {
    deleteSpy(...args);
    return {
      where: (...wArgs: unknown[]) => whereSpy(...wArgs),
    };
  };
}

/**
 * Module shape for `@clerk/nextjs/server`. Intended for use inside
 * `vi.mock("@clerk/nextjs/server", () => makeClerkAuthMock(() => mockAuth()))`.
 * The global test setup already installs a happy-path Clerk mock; action tests
 * override it so they can drive `userId` per test (e.g. null for the
 * unauthenticated case).
 */
export function makeClerkAuthMock(authSpy: () => unknown) {
  return { auth: authSpy };
}

/**
 * Module shape for `@/db/helpers`. Intended for use inside
 * `vi.mock("@/db/helpers", () => makeUserHelpersMock(mockEnsureUserExists))`.
 */
export function makeUserHelpersMock(
  ensureUserExistsSpy: (...args: unknown[]) => unknown,
) {
  return { ensureUserExists: ensureUserExistsSpy };
}

/**
 * Default "happy path" `beforeEach` body for server-action tests.
 * Clears all mocks, signs in as `user_123`, makes `ensureUserExists` a no-op.
 * Usage: `beforeEach(happyPathSetup(mockAuth, mockEnsureUserExists))`
 * Call a second `beforeEach(...)` for describe-specific mock resets.
 */
export function happyPathSetup(authSpy: MockFn, ensureUserExistsSpy: MockFn) {
  return () => {
    vi.clearAllMocks();
    authSpy.mockResolvedValue({ userId: "user_123" });
    ensureUserExistsSpy.mockResolvedValue(undefined);
  };
}

/**
 * Test body for the canonical "returns { success: false } when
 * unauthenticated" case. Sets the auth spy to return `{ userId: null }`,
 * runs the action, and asserts the action failed AND that `blockedSpy`
 * (the next-in-chain operation that should have been gated) was never
 * called. Usage:
 *
 *   it("... when unauthenticated", testUnauthenticated(
 *     mockAuth,
 *     async () => (await import("...")).action(),
 *     mockFindFirst,
 *   ))
 */
export function testUnauthenticated(
  authSpy: MockFn,
  runAction: () => Promise<{ success: boolean }>,
  blockedSpy: MockFn,
) {
  return async () => {
    authSpy.mockResolvedValue({ userId: null });
    const result = await runAction();
    expect(result.success).toBe(false);
    expect(blockedSpy).not.toHaveBeenCalled();
  };
}

/**
 * Test body for the canonical "returns { success: false } on DB error" case.
 * Makes `failingSpy` reject with `new Error("DB failure")`, silences
 * `console.error`, runs the action, and asserts failure + that
 * `console.error` was invoked.
 */
export function testDbError(
  failingSpy: MockFn,
  runAction: () => Promise<{ success: boolean }>,
) {
  return async () => {
    failingSpy.mockRejectedValue(new Error("DB failure"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runAction();
    expect(result.success).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
  };
}
