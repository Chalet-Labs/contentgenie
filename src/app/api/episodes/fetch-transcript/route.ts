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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }
  const { episodeId } = body as { episodeId?: unknown };

  // Validate: episodeId is episodes.id (DB primary key), NOT podcastIndexId
  if (typeof episodeId !== "number" || !Number.isInteger(episodeId) || episodeId <= 0) {
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
    .where(eq(episodes.id, episodeId))
    .limit(1);
  if (!episode) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  // Validate podcastIndexId is numeric BEFORE the optimistic update —
  // RSS-sourced episodes have synthetic "rss-..." IDs that would produce NaN.
  // If we set 'fetching' first, the row gets stuck in that state on 400.
  const numericPodcastIndexId = Number(episode.podcastIndexId);
  if (!Number.isFinite(numericPodcastIndexId) || numericPodcastIndexId <= 0) {
    return NextResponse.json(
      { error: "Episode has a non-numeric PodcastIndex ID and cannot be fetched via this endpoint" },
      { status: 400 }
    );
  }

  // Set transcriptStatus to 'fetching' optimistically so the UI shows immediate feedback.
  // Only after validating the episode is queueable — avoids leaving rows stuck in 'fetching'.
  await db.update(episodes).set({
    transcriptStatus: "fetching",
    transcriptError: null,
    updatedAt: new Date(),
  }).where(eq(episodes.id, episodeId));

  // CRITICAL: episodeId in the task payload is podcastIndexId (as a number), NOT episodes.id.
  // The fetch-transcript task looks up the episode by podcastIndexId internally.
  const handle = await tasks.trigger<typeof fetchTranscriptTask>(
    "fetch-transcript",
    {
      episodeId: numericPodcastIndexId,
      enclosureUrl: episode.audioUrl ?? undefined,
      description: episode.description ?? undefined,
      force: true, // Admin is explicitly requesting a re-fetch — skip cache check
    }
  );

  // Store the run ID so the UI can reconnect after navigation.
  try {
    await db.update(episodes).set({
      transcriptRunId: handle.id,
      updatedAt: new Date(),
    }).where(eq(episodes.id, episodeId));
  } catch (err) {
    console.error("Failed to store transcriptRunId:", { episodeId, runId: handle.id, error: err instanceof Error ? err.message : String(err) });
  }

  // Token creation is non-critical — if it fails, the run is still queued.
  let publicAccessToken: string | undefined;
  try {
    publicAccessToken = await auth.createPublicToken({
      scopes: { read: { runs: [handle.id] } },
      expirationTime: "15m",
    });
  } catch (tokenError) {
    console.error("Failed to create Trigger.dev public token:", tokenError);
  }

  return NextResponse.json(
    { status: "queued", runId: handle.id, ...(publicAccessToken && { publicAccessToken }) },
    { status: 202 }
  );
  } catch (error) {
    console.error("Error triggering transcript fetch:", error);
    return NextResponse.json(
      { error: "Failed to trigger transcript fetch", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
