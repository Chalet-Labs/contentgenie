import { clerkClient } from "@clerk/nextjs/server";

/**
 * Look up a user's primary email from Clerk.
 * Falls back to "" if the lookup fails (e.g. network error, deleted user).
 */
export async function getClerkEmail(userId: string): Promise<string> {
  try {
    const user = await (await clerkClient()).users.getUser(userId);
    return user.emailAddresses?.[0]?.emailAddress ?? "";
  } catch {
    return "";
  }
}
