import { and, eq, gte, lte, inArray } from "drizzle-orm"
import { episodes } from "@/db/schema"

export interface EpisodeFilters {
  podcastId?: number
  transcriptStatuses?: string[]
  summaryStatuses?: string[]
  dateFrom?: Date
  dateTo?: Date
  page: number
}

export const PAGE_SIZE = 25

export function buildEpisodeWhereConditions(filters: EpisodeFilters) {
  const conditions = []

  if (filters.podcastId !== undefined) {
    conditions.push(eq(episodes.podcastId, filters.podcastId))
  }

  if (filters.transcriptStatuses && filters.transcriptStatuses.length > 0) {
    conditions.push(
      inArray(
        episodes.transcriptStatus,
        filters.transcriptStatuses as ("missing" | "fetching" | "available" | "failed")[]
      )
    )
  }

  if (filters.summaryStatuses && filters.summaryStatuses.length > 0) {
    conditions.push(
      inArray(
        episodes.summaryStatus,
        filters.summaryStatuses as ("queued" | "running" | "summarizing" | "completed" | "failed")[]
      )
    )
  }

  if (filters.dateFrom) {
    conditions.push(gte(episodes.publishDate, filters.dateFrom))
  }

  if (filters.dateTo) {
    // Normalize to end-of-day so episodes published later that day are included
    const endOfDay = new Date(filters.dateTo)
    endOfDay.setUTCHours(23, 59, 59, 999)
    conditions.push(lte(episodes.publishDate, endOfDay))
  }

  return conditions.length > 0 ? and(...conditions) : undefined
}
