import { auth } from "@clerk/nextjs/server";
import { tasks } from "@trigger.dev/sdk";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import { ADMIN_ROLE } from "@/lib/auth-roles";
import type { summarizeEpisode } from "@/trigger/summarize-episode";

export async function POST(request: Request) {
  const { userId, has } = await auth();
  if (!userId || !has({ role: ADMIN_ROLE })) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { episodeIds } = body as { episodeIds?: unknown };

  if (!Array.isArray(episodeIds) || episodeIds.length === 0) {
    return new Response(
      JSON.stringify({ error: "episodeIds must be a non-empty array" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (episodeIds.length > 100) {
    return new Response(
      JSON.stringify({ error: "Maximum 100 episode IDs per request" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (
    !episodeIds.every(
      (id) => typeof id === "number" && Number.isInteger(id) && id > 0,
    )
  ) {
    return new Response(
      JSON.stringify({ error: "All episodeIds must be positive integers" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  try {
    const episodesData = await db
      .select({
        id: episodes.id,
        transcriptStatus: episodes.transcriptStatus,
        summaryStatus: episodes.summaryStatus,
        podcastIndexId: episodes.podcastIndexId,
      })
      .from(episodes)
      .where(inArray(episodes.id, episodeIds as number[]));

    const validEpisodes = episodesData.filter(
      (e) =>
        e.transcriptStatus === "available" &&
        e.summaryStatus !== "queued" &&
        e.summaryStatus !== "running" &&
        e.summaryStatus !== "summarizing" &&
        typeof e.podcastIndexId === "string" &&
        e.podcastIndexId.length > 0 &&
        Number.isFinite(Number(e.podcastIndexId)) &&
        Number(e.podcastIndexId) > 0,
    );

    const validDbIds = validEpisodes.map((e) => e.id);
    const skipped = (episodeIds as number[]).length - validEpisodes.length;

    if (validDbIds.length > 0) {
      await db
        .update(episodes)
        .set({ summaryStatus: "queued", updatedAt: new Date() })
        .where(inArray(episodes.id, validDbIds));

      try {
        // The summarize-episode task expects PodcastIndex episode IDs (not DB row IDs)
        await tasks.batchTrigger<typeof summarizeEpisode>(
          "summarize-episode",
          validEpisodes.map((e) => ({
            payload: { episodeId: Number(e.podcastIndexId) },
          })),
        );
      } catch (triggerErr) {
        // Revert queued status if task triggering fails
        try {
          await db
            .update(episodes)
            .set({ summaryStatus: null, updatedAt: new Date() })
            .where(inArray(episodes.id, validDbIds));
        } catch (revertErr) {
          console.error("Failed to revert queued status:", revertErr);
        }
        throw triggerErr;
      }
    }

    return new Response(
      JSON.stringify({ queued: validDbIds.length, skipped }),
      {
        status: 202,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Batch resummarize error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to process batch request" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
