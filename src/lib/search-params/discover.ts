import { parseAsString } from "nuqs/server";

export const discoverSearchParams = {
  q: parseAsString.withDefault(""),
};
