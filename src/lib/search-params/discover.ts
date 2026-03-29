import { parseAsString } from "nuqs";

export const discoverSearchParams = {
  q: parseAsString.withDefault(""),
};
