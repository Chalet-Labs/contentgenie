export const SUBSCRIPTION_SORTS = [
  "recently-added",
  "title-asc",
  "latest-episode",
  "recently-listened",
] as const;

export type SubscriptionSort = (typeof SUBSCRIPTION_SORTS)[number];

export const DEFAULT_SUBSCRIPTION_SORT: SubscriptionSort = "recently-added";
