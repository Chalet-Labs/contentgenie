import { NextRequest, NextResponse } from "next/server";
import { auth as clerkAuth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { tasks, auth } from "@trigger.dev/sdk";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import { upsertPodcast } from "@/db/helpers";
import { ADMIN_ROLE } from "@/lib/auth-roles";
import { getEpisodeById, getPodcastById } from "@/lib/podcastindex";
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
  const { episodeId, podcastIndexId: rawPodcastIndexId } = body as { episodeId?: unknown; podcastIndexId?: unknown };

  // Two accepted paths (episodeId takes precedence when both are provided):
  // 1. episodeId (DB primary key) — existing callers, backward-compatible
  // 2. podcastIndexId — new path for episodes with no DB row yet

  let resolvedEpisodeId: number; // episodes.id (DB primary key)
  let numericPodcastIndexId: number;
  let resolvedAudioUrl: string | undefined;
  let resolvedDescription: string | undefined;

  if (episodeId !== undefined) {
    // --- Path 1: episodeId (DB primary key) ---
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
    numericPodcastIndexId = Number(episode.podcastIndexId);
    if (!Number.isFinite(numericPodcastIndexId) || numericPodcastIndexId <= 0) {
      return NextResponse.json(
        { error: "Episode has a non-numeric PodcastIndex ID and cannot be fetched via this endpoint" },
        { status: 400 }
      );
    }

    resolvedEpisodeId = episode.id;
    resolvedAudioUrl = episode.audioUrl ?? undefined;
    resolvedDescription = episode.description ?? undefined;
  } else if (rawPodcastIndexId !== undefined) {
    // --- Path 2: podcastIndexId — look up or create episode row on demand ---
    const parsedPodcastIndexId = Number(rawPodcastIndexId);
    if (
      typeof rawPodcastIndexId === "string" && rawPodcastIndexId.startsWith("rss-")
    ) {
      return NextResponse.json(
        { error: "Episode has a non-numeric PodcastIndex ID and cannot be fetched via this endpoint" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(parsedPodcastIndexId) || parsedPodcastIndexId <= 0) {
      return NextResponse.json({ error: "A valid positive podcastIndexId is required" }, { status: 400 });
    }

    numericPodcastIndexId = parsedPodcastIndexId;
    const podcastIndexIdStr = numericPodcastIndexId.toString();

    // Look for an existing DB row
    const existingEpisode = await db.query.episodes.findFirst({
      where: eq(episodes.podcastIndexId, podcastIndexIdStr),
      columns: { id: true, audioUrl: true, description: true },
    });

    if (existingEpisode) {
      resolvedEpisodeId = existingEpisode.id;
      resolvedAudioUrl = existingEpisode.audioUrl ?? undefined;
      resolvedDescription = existingEpisode.description ?? undefined;
    } else {
      // No DB row — fetch episode + podcast from PodcastIndex, then create stub
      let piEpisode: Awaited<ReturnType<typeof getEpisodeById>>["episode"];
      try {
        const piResponse = await getEpisodeById(numericPodcastIndexId);
        piEpisode = piResponse.episode;
      } catch (err) {
        console.error("PodcastIndex getEpisodeById failed:", { podcastIndexId: numericPodcastIndexId, error: err instanceof Error ? err.message : String(err) });
        return NextResponse.json({ error: "Failed to look up episode in PodcastIndex" }, { status: 502 });
      }
      if (!piEpisode) {
        return NextResponse.json({ error: "Episode not found in PodcastIndex" }, { status: 404 });
      }

      // Ensure the podcast row exists
      let podcastDbId: number;
      try {
        const piPodcastResponse = await getPodcastById(piEpisode.feedId);
        const piPodcast = piPodcastResponse.feed;
        const categoryValues = piPodcast.categories ? Object.values(piPodcast.categories) : [];
        podcastDbId = await upsertPodcast({
          podcastIndexId: piEpisode.feedId.toString(),
          title: piPodcast.title,
          description: piPodcast.description,
          publisher: piPodcast.author || piPodcast.ownerName,
          imageUrl: piPodcast.artwork || piPodcast.image,
          rssFeedUrl: piPodcast.url,
          categories: categoryValues.length > 0 ? categoryValues : undefined,
          totalEpisodes: piPodcast.episodeCount,
          latestEpisodeDate: piPodcast.newestItemPubdate
            ? new Date(piPodcast.newestItemPubdate * 1000)
            : undefined,
        }, { updateOnConflict: "full" });
      } catch (err) {
        console.error("Failed to fetch/upsert podcast:", { feedId: piEpisode.feedId, error: err instanceof Error ? err.message : String(err) });
        return NextResponse.json({ error: "Failed to fetch podcast data from PodcastIndex" }, { status: 502 });
      }

      // Insert episode stub with transcriptStatus: "fetching" atomically.
      // onConflictDoNothing handles race conditions (concurrent insert wins).
      try {
        await db.insert(episodes).values({
          podcastId: podcastDbId,
          podcastIndexId: podcastIndexIdStr,
          title: piEpisode.title,
          description: piEpisode.description,
          audioUrl: piEpisode.enclosureUrl,
          duration: piEpisode.duration,
          publishDate: piEpisode.datePublished
            ? new Date(piEpisode.datePublished * 1000)
            : null,
          transcriptStatus: "fetching",
          transcriptError: null,
        }).onConflictDoNothing({ target: episodes.podcastIndexId });
      } catch (err) {
        console.error("Failed to insert episode stub:", { podcastIndexId: podcastIndexIdStr, error: err instanceof Error ? err.message : String(err) });
        return NextResponse.json({ error: "Failed to create episode record" }, { status: 500 });
      }

      // Always re-query to get the authoritative id — onConflictDoNothing
      // returns nothing when a concurrent insert won the race.
      const createdEpisode = await db.query.episodes.findFirst({
        where: eq(episodes.podcastIndexId, podcastIndexIdStr),
        columns: { id: true },
      });
      if (!createdEpisode) {
        return NextResponse.json({ error: "Failed to create episode record" }, { status: 500 });
      }
      resolvedEpisodeId = createdEpisode.id;
      resolvedAudioUrl = piEpisode.enclosureUrl ?? undefined;
      resolvedDescription = piEpisode.description ?? undefined;
    }
  } else {
    return NextResponse.json({ error: "A valid positive episode ID is required" }, { status: 400 });
  }

  // Set transcriptStatus to 'fetching' optimistically so the UI shows immediate feedback.
  // This runs after all validation to avoid leaving rows stuck in 'fetching' on error.
  // For the podcastIndexId path the stub was already inserted with this status —
  // this update is idempotent and also covers the "existing row" sub-case.
  await db.update(episodes).set({
    transcriptStatus: "fetching",
    transcriptError: null,
    updatedAt: new Date(),
  }).where(eq(episodes.id, resolvedEpisodeId));

  // CRITICAL: episodeId in the task payload is podcastIndexId (as a number), NOT episodes.id.
  // The fetch-transcript task looks up the episode by podcastIndexId internally.
  const handle = await tasks.trigger<typeof fetchTranscriptTask>(
    "fetch-transcript",
    {
      episodeId: numericPodcastIndexId,
      enclosureUrl: resolvedAudioUrl,
      description: resolvedDescription,
      force: true, // Admin is explicitly requesting a re-fetch — skip cache check
    }
  );

  // Store the run ID so the UI can reconnect after navigation.
  try {
    await db.update(episodes).set({
      transcriptRunId: handle.id,
      updatedAt: new Date(),
    }).where(eq(episodes.id, resolvedEpisodeId));
  } catch (err) {
    console.error("Failed to store transcriptRunId:", { episodeId: resolvedEpisodeId, runId: handle.id, error: err instanceof Error ? err.message : String(err) });
  }

  // Token creation is non-critical — if it fails, the run is still queued.
  let publicAccessToken: string | undefined;
  try {
    publicAccessToken = await auth.createPublicToken({
      scopes: { read: { runs: [handle.id] } },
      expirationTime: "30m",
    });
  } catch (tokenError) {
    console.error("Failed to create Trigger.dev public token:", tokenError);
  }

  return NextResponse.json(
    {
      status: "queued",
      runId: handle.id,
      episodeDbId: resolvedEpisodeId,
      ...(publicAccessToken && { publicAccessToken }),
    },
    { status: 202 }
  );
  } catch (error) {
    console.error("Unhandled error in fetch-transcript route:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
