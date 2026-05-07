import { createLoader, parseAsBoolean } from "nuqs/server";

export const topicDetailSearchParams = {
  unheard: parseAsBoolean.withDefault(false),
};

export const loadTopicDetailSearchParams = createLoader(
  topicDetailSearchParams,
);
