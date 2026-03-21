import { NextRequest, NextResponse } from "next/server";
import { auth as clerkAuth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
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
  const { episodeId } = body;

  // Validate: episodeId is episodes.id (DB primary key), NOT podcastIndexId
  const numericId = Number(episodeId);
  if (!Number.isFinite(numericId) || numericId <= 0 || !Number.isInteger(numericId)) {
    return NextResponse.json({ error: "A valid positive episode ID is required" }, { status: 400 });
  }

  // Look up episode by primary key
  const episode = await db.query.episodes.findFirst({
    where: eq(episodes.id, numericId),
  });
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

  // CRITICAL: episodeId in the task payload is podcastIndexId (as a number), NOT episodes.id.
  // The fetch-transcript task looks up the episode by podcastIndexId internally.
  // NOTE: FetchTranscriptPayload also accepts `transcripts` (PodcastIndex transcript URLs),
  // but these are not stored on the episode row — they come from the PodcastIndex API at
  // feed-poll time. The task falls back gracefully to other sources without them.
  const handle = await tasks.trigger<typeof fetchTranscriptTask>(
    "fetch-transcript",
    {
      episodeId: Number(episode.podcastIndexId),
      enclosureUrl: episode.audioUrl ?? undefined,
      description: episode.description ?? undefined,
      force: true,
    }
  );

  const publicAccessToken = await auth.createPublicToken({
    scopes: { read: { runs: [handle.id] } },
    expirationTime: "15m",
  });

  return NextResponse.json({ runId: handle.id, publicAccessToken }, { status: 202 });
}
