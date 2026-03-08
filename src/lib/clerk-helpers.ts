import { clerkClient } from "@clerk/nextjs/server";

/**
 * Look up a user's primary email from Clerk.
 * Prefers the primary email address, falls back to first available, then "".
 */
export async function getClerkEmail(userId: string): Promise<string> {
  try {
    const user = await (await clerkClient()).users.getUser(userId);
    return (
      user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)
        ?.emailAddress ??
      user.emailAddresses?.[0]?.emailAddress ??
      ""
    );
  } catch {
    return "";
  }
}
