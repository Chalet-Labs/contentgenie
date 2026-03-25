import { and, eq, gte, lte, inArray } from "drizzle-orm"
import { episodes } from "@/db/schema"
import { safeParseDate } from "@/lib/schemas/library"

export interface EpisodeFilters {
  podcastId?: number
  transcriptStatuses?: string[]
  summaryStatuses?: string[]
  dateFrom?: Date
  dateTo?: Date
  page: number
}

export const PAGE_SIZE = 25

function asArray(val: string | string[] | undefined): string[] {
  if (!val) return []
  return Array.isArray(val) ? val : [val]
}

export function parseEpisodeFilters(
  searchParams: Record<string, string | string[] | undefined>
): EpisodeFilters {
  const podcastIdRaw = searchParams["podcastId"]
  const podcastId =
    typeof podcastIdRaw === "string" && podcastIdRaw
      ? parseInt(podcastIdRaw, 10) || undefined
      : undefined

  const transcriptStatuses = asArray(searchParams["transcriptStatus"]).filter(Boolean)
  const summaryStatuses = asArray(searchParams["summaryStatus"]).filter(Boolean)

  const dateFromRaw = searchParams["dateFrom"]
  const dateFrom = safeParseDate(typeof dateFromRaw === "string" ? dateFromRaw : undefined)
  const dateToRaw = searchParams["dateTo"]
  const dateTo = safeParseDate(typeof dateToRaw === "string" ? dateToRaw : undefined)

  const pageRaw = typeof searchParams["page"] === "string" ? parseInt(searchParams["page"], 10) : NaN
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1

  return {
    podcastId,
    transcriptStatuses: transcriptStatuses.length > 0 ? transcriptStatuses : undefined,
    summaryStatuses: summaryStatuses.length > 0 ? summaryStatuses : undefined,
    dateFrom,
    dateTo,
    page,
  }
}

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
