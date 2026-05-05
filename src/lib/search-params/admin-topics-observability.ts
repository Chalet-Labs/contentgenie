import { parseAsStringLiteral, createLoader } from "nuqs/server";

export const WINDOW_KEYS = ["24h", "7d", "30d"] as const;
export type WindowKey = (typeof WINDOW_KEYS)[number];

export const GRANULARITY_KEYS = ["day", "week"] as const;
export type GranularityKey = (typeof GRANULARITY_KEYS)[number];

export const adminTopicsObservabilitySearchParams = {
  window: parseAsStringLiteral(WINDOW_KEYS).withDefault("7d"),
  granularity: parseAsStringLiteral(GRANULARITY_KEYS).withDefault("day"),
};

export const loadAdminTopicsObservabilitySearchParams = createLoader(
  adminTopicsObservabilitySearchParams,
);
