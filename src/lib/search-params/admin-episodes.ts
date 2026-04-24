import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsIsoDate,
  parseAsString,
  createLoader,
} from "nuqs/server";

export const adminEpisodeSearchParams = {
  podcastId: parseAsInteger,
  transcriptStatus: parseAsArrayOf(parseAsString),
  summaryStatus: parseAsArrayOf(parseAsString),
  dateFrom: parseAsIsoDate,
  dateTo: parseAsIsoDate,
  page: parseAsInteger.withDefault(1),
};

export const loadAdminEpisodeSearchParams = createLoader(
  adminEpisodeSearchParams,
);
