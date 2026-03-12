/**
 * Centralized route path constants.
 * Kept in sync with the Next.js App Router file-system routes under app/(app)/.
 */
export const ROUTES = {
  DASHBOARD: "/dashboard",
  DISCOVER: "/discover",
  SUBSCRIPTIONS: "/subscriptions",
  LIBRARY: "/library",
  SETTINGS: "/settings",
} as const

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES]
