export const BACK_NAVIGATION: Record<string, { href: string; label: string }> = {
  discover: { href: "/discover", label: "Back to Discover" },
  subscriptions: { href: "/subscriptions", label: "Back to Subscriptions" },
  dashboard: { href: "/dashboard", label: "Back to Dashboard" },
  library: { href: "/library", label: "Back to Library" },
};

export function getBackNavigation(from: string | undefined) {
  if (from && from in BACK_NAVIGATION) {
    return BACK_NAVIGATION[from];
  }
  return { href: "/discover", label: "Back to Discover" };
}
