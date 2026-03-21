import { NextRequest, NextResponse } from "next/server";
import { auth as clerkAuth } from "@clerk/nextjs/server";
import { inArray } from "drizzle-orm";
import { tasks, auth } from "@trigger.dev/sdk";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import { ADMIN_ROLE } from "@/lib/auth-roles";
import type { fetchTranscriptTask } from "@/trigger/fetch-transcript";

export async function POST(request: NextRequest) {
  const { userId, has } = await clerkAuth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!has({ role: ADMIN_ROLE })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { episodeIds } = body;

  if (!Array.isArray(episodeIds) || episodeIds.length === 0) {
    return NextResponse.json({ error: "episodeIds must be a non-empty array" }, { status: 400 });
  }
  if (episodeIds.length > 20) {
    return NextResponse.json({ error: "Maximum 20 episodes per batch" }, { status: 400 });
  }
  if (!episodeIds.every((id: unknown) => typeof id === "number" && Number.isFinite(id) && id > 0 && Number.isInteger(id))) {
    return NextResponse.json({ error: "All episode IDs must be positive integers" }, { status: 400 });
  }

  // Look up all episodes by primary key (episodeIds are episodes.id, NOT podcastIndexId)
  const foundEpisodes = await db.query.episodes.findMany({
    where: inArray(episodes.id, episodeIds),
  });

  if (foundEpisodes.length !== episodeIds.length) {
    const foundIds = new Set(foundEpisodes.map((e) => e.id));
    const missing = episodeIds.filter((id: number) => !foundIds.has(id));
    return NextResponse.json({ error: `Episodes not found: ${missing.join(", ")}` }, { status: 400 });
  }

  // Set transcriptStatus to 'fetching' for all episodes optimistically.
  // Stale 'fetching' rows remain visible in the stats query and can be retried.
  await db.update(episodes).set({
    transcriptStatus: "fetching",
    transcriptError: null,
    updatedAt: new Date(),
  }).where(inArray(episodes.id, episodeIds));

  // CRITICAL: episodeId in each task payload is podcastIndexId (as a number), NOT episodes.id.
  // NOTE: FetchTranscriptPayload also accepts `transcripts` (PodcastIndex transcript URLs),
  // but these are not stored on the episode row — they come from the PodcastIndex API at
  // feed-poll time. The task falls back gracefully to other sources without them.
  const batchResult = await tasks.batchTrigger<typeof fetchTranscriptTask>(
    "fetch-transcript",
    foundEpisodes.map((ep) => ({
      payload: {
        episodeId: Number(ep.podcastIndexId),
        enclosureUrl: ep.audioUrl ?? undefined,
        description: ep.description ?? undefined,
        force: true,
      },
    }))
  );

  // tasks.batchTrigger returns { batchId, runCount } — no per-run IDs at trigger time.
  // Scope the public access token to the batch so the caller can monitor via batchId.
  const publicAccessToken = await auth.createPublicToken({
    scopes: { read: { batch: batchResult.batchId } },
    expirationTime: "15m",
  });

  return NextResponse.json(
    { batchId: batchResult.batchId, runCount: batchResult.runCount, publicAccessToken, total: episodeIds.length },
    { status: 202 }
  );
}
