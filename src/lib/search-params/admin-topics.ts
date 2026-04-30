import { parseAsInteger, parseAsString, createLoader } from "nuqs/server";

export const adminTopicSearchParams = {
  search: parseAsString,
  status: parseAsString,
  kind: parseAsString,
  page: parseAsInteger.withDefault(1),
};

export const loadAdminTopicSearchParams = createLoader(adminTopicSearchParams);
