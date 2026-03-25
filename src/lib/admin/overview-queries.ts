import { db } from "@/db"
import { episodes, podcasts } from "@/db/schema"
import { count, sql, or, eq, gte, and } from "drizzle-orm"

export interface OverviewStats {
  totalPodcasts: number
  totalEpisodes: number
  transcriptCoverage: number // percentage 0-100
  summaryCoverage: number // percentage 0-100
  processedToday: number
  queueDepthApprox: number
  activeFetchesApprox: number
}

export interface TranscriptSourceBreakdown {
  source: string | null
  count: number
}

export interface RecentFailure {
  id: number
  title: string
  transcriptStatus: string | null
  summaryStatus: string | null
  updatedAt: Date
  transcriptError: string | null
  processingError: string | null
}

export interface FailureTrendEntry {
  day: string // YYYY-MM-DD
  count: number
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const [podcastCount, episodeCount, transcriptCount, summaryCount, todayCount, queueCount, fetchCount] =
    await Promise.all([
      db.select({ value: count() }).from(podcasts),
      db.select({ value: count() }).from(episodes),
      db
        .select({ value: count() })
        .from(episodes)
        .where(eq(episodes.transcriptStatus, "available")),
      db
        .select({ value: count() })
        .from(episodes)
        .where(eq(episodes.summaryStatus, "completed")),
      db
        .select({ value: count() })
        .from(episodes)
        .where(
          and(
            eq(episodes.summaryStatus, "completed"),
            gte(episodes.processedAt, sql`NOW() - INTERVAL '1 day'`)
          )
        ),
      db
        .select({ value: count() })
        .from(episodes)
        .where(
          or(
            eq(episodes.summaryStatus, "queued"),
            eq(episodes.summaryStatus, "running"),
            eq(episodes.summaryStatus, "summarizing")
          )
        ),
      db
        .select({ value: count() })
        .from(episodes)
        .where(eq(episodes.transcriptStatus, "fetching")),
    ])

  const total = episodeCount[0]?.value ?? 0
  const transcripts = transcriptCount[0]?.value ?? 0
  const summaries = summaryCount[0]?.value ?? 0

  return {
    totalPodcasts: podcastCount[0]?.value ?? 0,
    totalEpisodes: total,
    transcriptCoverage: total > 0 ? Math.round((Number(transcripts) / Number(total)) * 100) : 0,
    summaryCoverage: total > 0 ? Math.round((Number(summaries) / Number(total)) * 100) : 0,
    processedToday: Number(todayCount[0]?.value ?? 0),
    queueDepthApprox: Number(queueCount[0]?.value ?? 0),
    activeFetchesApprox: Number(fetchCount[0]?.value ?? 0),
  }
}

export async function getTranscriptSourceBreakdown(): Promise<TranscriptSourceBreakdown[]> {
  const rows = await db
    .select({
      source: episodes.transcriptSource,
      count: count(),
    })
    .from(episodes)
    .where(eq(episodes.transcriptStatus, "available"))
    .groupBy(episodes.transcriptSource)

  return rows.map((r) => ({ source: r.source ?? null, count: Number(r.count) }))
}

export async function getRecentFailures(): Promise<RecentFailure[]> {
  const rows = await db
    .select({
      id: episodes.id,
      title: episodes.title,
      transcriptStatus: episodes.transcriptStatus,
      summaryStatus: episodes.summaryStatus,
      updatedAt: episodes.updatedAt,
      transcriptError: episodes.transcriptError,
      processingError: episodes.processingError,
    })
    .from(episodes)
    .where(
      or(
        eq(episodes.transcriptStatus, "failed"),
        eq(episodes.summaryStatus, "failed")
      )
    )
    .orderBy(sql`${episodes.updatedAt} DESC`)
    .limit(10)

  return rows
}

export async function getFailureTrend(): Promise<FailureTrendEntry[]> {
  const rows = await db
    .select({
      day: sql<string>`DATE(${episodes.updatedAt})`.as("day"),
      count: count(),
    })
    .from(episodes)
    .where(
      and(
        or(
          eq(episodes.transcriptStatus, "failed"),
          eq(episodes.summaryStatus, "failed")
        ),
        gte(episodes.updatedAt, sql`NOW() - INTERVAL '7 days'`)
      )
    )
    .groupBy(sql`DATE(${episodes.updatedAt})`)

  // Generate all 7 days and zero-fill missing ones
  const today = new Date()
  const dbMap = new Map(rows.map((r) => [r.day, Number(r.count)]))

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (6 - i))
    const dayStr = d.toISOString().split("T")[0]
    return { day: dayStr, count: dbMap.get(dayStr) ?? 0 }
  })
}

