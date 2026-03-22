import { NextRequest, NextResponse } from "next/server";
import { auth as clerkAuth } from "@clerk/nextjs/server";
import { inArray } from "drizzle-orm";
import { tasks } from "@trigger.dev/sdk";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import { ADMIN_ROLE } from "@/lib/auth-roles";
import type { fetchTranscriptTask } from "@/trigger/fetch-transcript";

export async function POST(request: NextRequest) {
  try {
  const { userId, has } = await clerkAuth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!has({ role: ADMIN_ROLE })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }
  const { episodeIds } = body as { episodeIds?: unknown };

  if (!Array.isArray(episodeIds) || episodeIds.length === 0) {
    return NextResponse.json({ error: "episodeIds must be a non-empty array" }, { status: 400 });
  }
  if (!episodeIds.every((id: unknown) => typeof id === "number" && Number.isFinite(id) && id > 0 && Number.isInteger(id))) {
    return NextResponse.json({ error: "All episode IDs must be positive integers" }, { status: 400 });
  }

  // Deduplicate IDs so inArray + length comparison works correctly
  const uniqueIds = Array.from(new Set(episodeIds as number[]));
  if (uniqueIds.length > 20) {
    return NextResponse.json({ error: "Maximum 20 unique episodes per batch" }, { status: 400 });
  }

  // episodeIds are episodes.id (primary key), NOT podcastIndexId
  const foundEpisodes = await db
    .select({
      id: episodes.id,
      podcastIndexId: episodes.podcastIndexId,
      audioUrl: episodes.audioUrl,
      description: episodes.description,
    })
    .from(episodes)
    .where(inArray(episodes.id, uniqueIds));

  if (foundEpisodes.length !== uniqueIds.length) {
    const foundIds = new Set(foundEpisodes.map((e) => e.id));
    const missing = uniqueIds.filter((id) => !foundIds.has(id));
    return NextResponse.json({ error: `Episodes not found: ${missing.join(", ")}` }, { status: 400 });
  }

  // Filter out episodes with non-numeric podcastIndexId (e.g. synthetic "rss-..." IDs)
  const fetchable = foundEpisodes.filter((ep) => {
    const n = Number(ep.podcastIndexId);
    return Number.isFinite(n) && n > 0;
  });
  const skippedCount = foundEpisodes.length - fetchable.length;

  if (fetchable.length === 0) {
    return NextResponse.json(
      { error: "None of the selected episodes have numeric PodcastIndex IDs" },
      { status: 400 }
    );
  }

  const fetchableIds = fetchable.map((ep) => ep.id);

  // Set transcriptStatus to 'fetching' for fetchable episodes optimistically.
  // Stale 'fetching' rows remain visible in the stats query and can be retried.
  await db.update(episodes).set({
    transcriptStatus: "fetching",
    transcriptError: null,
    updatedAt: new Date(),
  }).where(inArray(episodes.id, fetchableIds));

  // CRITICAL: episodeId in each task payload is podcastIndexId (as a number), NOT episodes.id.
  // NOTE: FetchTranscriptPayload also accepts `transcripts` (PodcastIndex transcript URLs),
  // but these are not stored on the episode row — they come from the PodcastIndex API at
  // feed-poll time. The task falls back gracefully to other sources without them.
  const batchResult = await tasks.batchTrigger<typeof fetchTranscriptTask>(
    "fetch-transcript",
    fetchable.map((ep) => ({
      payload: {
        episodeId: Number(ep.podcastIndexId),
        enclosureUrl: ep.audioUrl ?? undefined,
        description: ep.description ?? undefined,
        force: true, // Admin is explicitly requesting a re-fetch — skip cache check
      },
    }))
  );

  // batchTrigger resolves with { batchId, runCount, publicAccessToken }.
  // Individual run IDs are not in the immediate response — use subscribeToBatch to track per-run status.
  return NextResponse.json({
    batchId: batchResult.batchId,
    publicAccessToken: batchResult.publicAccessToken,
    total: fetchable.length,
    ...(skippedCount > 0 && { skipped: skippedCount }),
  }, { status: 202 });
  } catch (error) {
    console.error("Error triggering batch transcript fetch:", error);
    return NextResponse.json(
      { error: "Failed to trigger batch transcript fetch", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
