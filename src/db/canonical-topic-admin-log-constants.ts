export const ADMIN_LOG_ACTIONS = {
  merge: "merge",
  unmerge: "unmerge",
} as const;

export const ADMIN_LOG_ACTION_VALUES = [
  ADMIN_LOG_ACTIONS.merge,
  ADMIN_LOG_ACTIONS.unmerge,
] as const;

export type AdminLogAction = (typeof ADMIN_LOG_ACTION_VALUES)[number];
