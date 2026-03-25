import { auth } from "@clerk/nextjs/server"
import { tasks } from "@trigger.dev/sdk"
import { eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import { episodes } from "@/db/schema"
import { ADMIN_ROLE } from "@/lib/auth-roles"

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

  // Fetch transcript status for all requested episodes in one query
  const episodesData = await db
    .select({ id: episodes.id, transcriptStatus: episodes.transcriptStatus })
    .from(episodes)
    .where(inArray(episodes.id, episodeIds as number[]))

  const validIds = episodesData
    .filter((e) => e.transcriptStatus === "available")
    .map((e) => e.id)

  const skipped = (episodeIds as number[]).length - validIds.length

  if (validIds.length > 0) {
    // Update all valid episodes to queued status
    await db
      .update(episodes)
      .set({ summaryStatus: "queued", updatedAt: new Date() })
      .where(inArray(episodes.id, validIds))

    // Trigger summarization tasks
    await tasks.batchTrigger(
      "summarize-episode",
      validIds.map((id) => ({ payload: { episodeId: id } }))
    )
  }

  return new Response(
    JSON.stringify({ queued: validIds.length, skipped }),
    {
      status: 202,
      headers: { "Content-Type": "application/json" },
    }
  )
}
