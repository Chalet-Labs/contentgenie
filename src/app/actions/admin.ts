"use server"

import { auth } from "@clerk/nextjs/server"
import { eq, and, or, ilike } from "drizzle-orm"
import { db } from "@/db"
import { episodes, podcasts } from "@/db/schema"
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
  | { ok: true; transcriptStatus: string | null; summaryStatus: string | null }
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
      columns: { transcriptStatus: true, summaryStatus: true },
    })

    if (!row) return { ok: false, error: "Episode not found" }

    return {
      ok: true,
      transcriptStatus: row.transcriptStatus ?? null,
      summaryStatus: row.summaryStatus ?? null,
    }
  } catch (error) {
    console.error("getEpisodeStatus error:", error)
    return { ok: false, error: "Failed to check status" }
  }
}
