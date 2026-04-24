/**
 * Auth-guarded server action wrapper.
 *
 * Every server action in the codebase needs the same check: `auth()` returns
 * a `userId`, and if not we bail with a `{ success: false, error: "Unauthorized" }`
 * response. Writing that guard manually at every call site is error-prone —
 * forgetting it in a new action means an unauthenticated request flows into
 * the DB. Funneling through `withAuthAction` makes the check a type-level
 * requirement: a server action either wraps its body in `withAuthAction` or
 * it has to spell the guard out manually (reviewable).
 *
 * The wrapper is a plain helper (no `"use server"` directive), so importing
 * it into an action file doesn't expose it as a server action — only the
 * module's own exports become server actions.
 */
import { auth } from "@clerk/nextjs/server";

type UnauthorizedFailure = { success: false; error: "Unauthorized" };

/**
 * Runs `fn` with the authenticated `userId`. Returns an `Unauthorized`
 * failure (matching every action's existing failure shape) when no session
 * is present, short-circuiting before `fn` executes.
 */
export async function withAuthAction<T>(
  fn: (userId: string) => Promise<T>,
): Promise<T | UnauthorizedFailure> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };
  return fn(userId);
}
