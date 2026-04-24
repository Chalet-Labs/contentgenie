/**
 * Mock factory for `@clerk/nextjs/server`. Intended for use inside
 * `vi.mock("@clerk/nextjs/server", () => makeClerkAuthMock(() => mockAuth()))`.
 *
 * The global test setup installs a happy-path Clerk mock; tests that need to
 * drive `userId` per test (e.g. null for the unauthenticated case) override it
 * with this helper.
 */
export function makeClerkAuthMock(authSpy: () => unknown) {
  return { auth: authSpy };
}
