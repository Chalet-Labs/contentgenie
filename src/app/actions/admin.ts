"use server"

import { auth } from "@clerk/nextjs/server"
import { eq, and, or, ilike } from "drizzle-orm"
import { db } from "@/db"
import { episodes, podcasts, type TranscriptStatus, type SummaryStatus } from "@/db/schema"
import { ADMIN_ROLE } from "@/lib/auth-roles"

export interface EpisodeSearchResult {
  id: number
  title: string
  podcastTitle: string
}

export async function searchEpisodesWithTranscript(
  query: string
): Promise<{ results: EpisodeSearchResult[]; error?: string }> {
  const { has } = await auth()
  if (!has({ role: ADMIN_ROLE })) {
    return { results: [], error: "Admin access required" }
  }

  try {
    const rows = await db
      .select({
        id: episodes.id,
        title: episodes.title,
        podcastTitle: podcasts.title,
      })
      .from(episodes)
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(
        and(
          eq(episodes.transcriptStatus, "available"),
          or(
            ilike(episodes.title, `%${query.replace(/[%_\\]/g, "\\$&")}%`),
            ilike(podcasts.title, `%${query.replace(/[%_\\]/g, "\\$&")}%`)
          )
        )
      )
      .limit(20)

    return { results: rows }
  } catch (error) {
    console.error("searchEpisodesWithTranscript error:", error)
    return { results: [], error: "Search failed" }
  }
}

export type EpisodeStatusResult =
  | {
      ok: true
      transcriptStatus: TranscriptStatus | null
      summaryStatus: SummaryStatus | null
      transcriptRunId: string | null
      summaryRunId: string | null
    }
  | { ok: false; error: string }

export async function getEpisodeStatus(
  id: number
): Promise<EpisodeStatusResult> {
  const { has } = await auth()
  if (!has({ role: ADMIN_ROLE })) {
    return { ok: false, error: "Admin access required" }
  }

  try {
    const row = await db.query.episodes.findFirst({
      where: eq(episodes.id, id),
      columns: {
        transcriptStatus: true,
        summaryStatus: true,
        transcriptRunId: true,
        summaryRunId: true,
      },
    })

    if (!row) return { ok: false, error: "Episode not found" }

    return {
      ok: true,
      transcriptStatus: row.transcriptStatus ?? null,
      summaryStatus: row.summaryStatus ?? null,
      transcriptRunId: row.transcriptRunId ?? null,
      summaryRunId: row.summaryRunId ?? null,
    }
  } catch (error) {
    console.error("getEpisodeStatus error:", error)
    return { ok: false, error: "Failed to check status" }
  }
}

export type RunReconnectionResult =
  | { ok: true; runId: string; publicAccessToken: string }
  | { ok: false; error: string }

export async function getRunReconnectionData(
  episodeId: number,
  runType: "transcript" | "summary"
): Promise<RunReconnectionResult> {
  const { has } = await auth()
  if (!has({ role: ADMIN_ROLE })) {
    return { ok: false, error: "Admin access required" }
  }

  if (!Number.isInteger(episodeId) || episodeId <= 0) {
    return { ok: false, error: "Invalid episode ID" }
  }
  if (runType !== "transcript" && runType !== "summary") {
    return { ok: false, error: "Invalid run type" }
  }

  try {
    const row = await db.query.episodes.findFirst({
      where: eq(episodes.id, episodeId),
      columns: { transcriptRunId: true, summaryRunId: true },
    })

    if (!row) return { ok: false, error: "Episode not found" }

    const runId = runType === "transcript" ? row.transcriptRunId : row.summaryRunId
    if (!runId) return { ok: false, error: "No in-flight run" }

    const { auth: triggerAuth } = await import("@trigger.dev/sdk")
    // Token must outlast client-side staleness timeout (20 min transcript, 10 min summary)
    const tokenTtl = runType === "transcript" ? "30m" : "15m"
    const publicAccessToken = await triggerAuth.createPublicToken({
      scopes: { read: { runs: [runId] } },
      expirationTime: tokenTtl,
    })

    return { ok: true, runId, publicAccessToken }
  } catch (error) {
    console.error("getRunReconnectionData error:", { episodeId, runType, error })
    return { ok: false, error: "Failed to get reconnection data" }
  }
}
