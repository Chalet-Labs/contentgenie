import { parseAsStringLiteral, createLoader } from "nuqs/server";

export const adminTopicsObservabilitySearchParams = {
  window: parseAsStringLiteral(["today", "7d", "30d"] as const).withDefault(
    "7d",
  ),
};

export const loadAdminTopicsObservabilitySearchParams = createLoader(
  adminTopicsObservabilitySearchParams,
);
