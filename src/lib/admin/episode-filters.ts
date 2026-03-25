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

function parseValidDate(raw: string | string[] | undefined): Date | undefined {
  if (typeof raw !== "string" || !raw) return undefined
  const d = new Date(raw)
  if (isNaN(d.getTime())) return undefined
  return d
}

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

  const dateFrom = parseValidDate(searchParams["dateFrom"])
  const dateTo = parseValidDate(searchParams["dateTo"])

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
