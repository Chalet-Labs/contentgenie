import React from "react";

export type ClerkMockState = { signedIn: boolean };

// Factory for mocking @clerk/nextjs primitives in Vitest suites. Callers own
// the `state` ref (typically via vi.hoisted) and mutate `state.signedIn` per
// test; the stubs read it by reference at render time.
//
// Usage (inside a test file):
//   const { clerkState } = vi.hoisted(() => ({ clerkState: { signedIn: false } }))
//   vi.mock("@clerk/nextjs", async () => {
//     const { createClerkMock } = await vi.importActual<typeof import("@/test/mocks/clerk-nextjs")>(
//       "@/test/mocks/clerk-nextjs"
//     )
//     return createClerkMock(clerkState)
//   })
export function createClerkMock(state: ClerkMockState) {
  return {
    SignedIn: ({ children }: { children: React.ReactNode }) =>
      state.signedIn ? <>{children}</> : null,
    SignedOut: ({ children }: { children: React.ReactNode }) =>
      state.signedIn ? null : <>{children}</>,
    SignInButton: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    SignUpButton: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    UserButton: () => <div data-testid="user-button" />,
  };
}
