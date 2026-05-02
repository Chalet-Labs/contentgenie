import { parseAsInteger, parseAsString, createLoader } from "nuqs/server";

export const adminTopicSearchParams = {
  search: parseAsString,
  status: parseAsString,
  kind: parseAsString,
  // "yes" | "no" | null (tri-state: null = Any, "yes" = ongoing, "no" = not ongoing).
  // parseAsBoolean conflates null and false, so we use parseAsString here.
  ongoing: parseAsString,
  episodeCountMin: parseAsInteger,
  episodeCountMax: parseAsInteger,
  page: parseAsInteger.withDefault(1),
};

export const loadAdminTopicSearchParams = createLoader(adminTopicSearchParams);
