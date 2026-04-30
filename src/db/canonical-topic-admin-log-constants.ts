export const ADMIN_LOG_ACTIONS = ["merge", "unmerge"] as const;
export type AdminLogAction = (typeof ADMIN_LOG_ACTIONS)[number];
