import { auth } from "@clerk/nextjs/server"
import { tasks } from "@trigger.dev/sdk"
import { inArray } from "drizzle-orm"
import { db } from "@/db"
import { episodes } from "@/db/schema"
import { ADMIN_ROLE } from "@/lib/auth-roles"
import type { summarizeEpisode } from "@/trigger/summarize-episode"

export async function POST(request: Request) {
  const { has } = await auth()
  if (!has({ role: ADMIN_ROLE })) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const { episodeIds } = body as { episodeIds?: unknown }

  if (!Array.isArray(episodeIds) || episodeIds.length === 0) {
    return new Response(JSON.stringify({ error: "episodeIds must be a non-empty array" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (episodeIds.length > 100) {
    return new Response(JSON.stringify({ error: "Maximum 100 episode IDs per request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (!episodeIds.every((id) => typeof id === "number" && Number.isInteger(id) && id > 0)) {
    return new Response(JSON.stringify({ error: "All episodeIds must be positive integers" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Fetch transcript status and PodcastIndex IDs for all requested episodes
  const episodesData = await db
    .select({
      id: episodes.id,
      transcriptStatus: episodes.transcriptStatus,
      podcastIndexId: episodes.podcastIndexId,
    })
    .from(episodes)
    .where(inArray(episodes.id, episodeIds as number[]))

  // Only episodes with available transcripts and a numeric PodcastIndex ID are eligible
  const validEpisodes = episodesData.filter(
    (e) =>
      e.transcriptStatus === "available" &&
      typeof e.podcastIndexId === "string" &&
      e.podcastIndexId.length > 0 &&
      Number.isFinite(Number(e.podcastIndexId)) &&
      Number(e.podcastIndexId) > 0
  )

  const validDbIds = validEpisodes.map((e) => e.id)
  const skipped = (episodeIds as number[]).length - validEpisodes.length

  if (validDbIds.length > 0) {
    // Update all valid episodes to queued status
    await db
      .update(episodes)
      .set({ summaryStatus: "queued", updatedAt: new Date() })
      .where(inArray(episodes.id, validDbIds))

    // Trigger summarization tasks using PodcastIndex episode IDs
    await tasks.batchTrigger<typeof summarizeEpisode>(
      "summarize-episode",
      validEpisodes.map((e) => ({ payload: { episodeId: Number(e.podcastIndexId) } }))
    )
  }

  return new Response(
    JSON.stringify({ queued: validDbIds.length, skipped }),
    {
      status: 202,
      headers: { "Content-Type": "application/json" },
    }
  )
}
