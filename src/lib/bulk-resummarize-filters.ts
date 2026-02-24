import { isNotNull, lte, gte, eq } from "drizzle-orm";
import { episodes } from "@/db/schema";

export type ResummarizeFilters = {
  podcastId?: number;
  minDate?: string;
  maxDate?: string;
  maxScore?: number;
};

export function buildResummarizeConditions(filters: ResummarizeFilters) {
  const conditions = [isNotNull(episodes.processedAt)];

  if (filters.podcastId !== undefined) {
    conditions.push(eq(episodes.podcastId, filters.podcastId));
  }
  if (filters.minDate) {
    conditions.push(gte(episodes.publishDate, new Date(filters.minDate)));
  }
  if (filters.maxDate) {
    conditions.push(lte(episodes.publishDate, new Date(filters.maxDate)));
  }
  if (filters.maxScore !== undefined) {
    conditions.push(lte(episodes.worthItScore, String(filters.maxScore)));
  }

  return conditions;
}
