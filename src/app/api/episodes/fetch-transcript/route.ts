import { NextRequest, NextResponse } from "next/server";
import { auth as clerkAuth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { tasks, auth } from "@trigger.dev/sdk";
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { episodeId } = body;

  // Validate: episodeId is episodes.id (DB primary key), NOT podcastIndexId
  const numericId = Number(episodeId);
  if (!Number.isFinite(numericId) || numericId <= 0 || !Number.isInteger(numericId)) {
    return NextResponse.json({ error: "A valid positive episode ID is required" }, { status: 400 });
  }

  const [episode] = await db
    .select({
      id: episodes.id,
      podcastIndexId: episodes.podcastIndexId,
      audioUrl: episodes.audioUrl,
      description: episodes.description,
    })
    .from(episodes)
    .where(eq(episodes.id, numericId))
    .limit(1);
  if (!episode) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  // Set transcriptStatus to 'fetching' optimistically so the UI shows immediate feedback.
  // If the task fails, the row remains 'fetching' (stale). The stats query includes
  // 'fetching' so stale rows stay visible and can be retried.
  await db.update(episodes).set({
    transcriptStatus: "fetching",
    transcriptError: null,
    updatedAt: new Date(),
  }).where(eq(episodes.id, numericId));

  // Validate podcastIndexId is numeric — RSS-sourced episodes have synthetic "rss-..." IDs
  // that would produce NaN when passed to the fetch-transcript task.
  const numericPodcastIndexId = Number(episode.podcastIndexId);
  if (!Number.isFinite(numericPodcastIndexId) || numericPodcastIndexId <= 0) {
    return NextResponse.json(
      { error: "Episode has a non-numeric PodcastIndex ID and cannot be fetched via this endpoint" },
      { status: 400 }
    );
  }

  // CRITICAL: episodeId in the task payload is podcastIndexId (as a number), NOT episodes.id.
  // The fetch-transcript task looks up the episode by podcastIndexId internally.
  // NOTE: FetchTranscriptPayload also accepts `transcripts` (PodcastIndex transcript URLs),
  // but these are not stored on the episode row — they come from the PodcastIndex API at
  // feed-poll time. The task falls back gracefully to other sources without them.
  const handle = await tasks.trigger<typeof fetchTranscriptTask>(
    "fetch-transcript",
    {
      episodeId: numericPodcastIndexId,
      enclosureUrl: episode.audioUrl ?? undefined,
      description: episode.description ?? undefined,
      force: true, // Admin is explicitly requesting a re-fetch — skip cache check
    }
  );

  const publicAccessToken = await auth.createPublicToken({
    scopes: { read: { runs: [handle.id] } },
    expirationTime: "15m",
  });

  return NextResponse.json({ status: "queued", runId: handle.id, publicAccessToken }, { status: 202 });
  } catch (error) {
    console.error("Error triggering transcript fetch:", error);
    return NextResponse.json(
      { error: "Failed to trigger transcript fetch", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
