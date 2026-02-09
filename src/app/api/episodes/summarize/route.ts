import { NextRequest, NextResponse } from "next/server";
import { auth as clerkAuth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { tasks, auth } from "@trigger.dev/sdk";
import { db } from "@/db";
import { episodes, IN_PROGRESS_STATUSES } from "@/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import type { summarizeEpisode } from "@/trigger/summarize-episode";

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const { userId } = await clerkAuth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get episode ID from request body
    const body = await request.json();
    const { episodeId } = body;

    const numericEpisodeId = Number(episodeId);
    if (!episodeId || !Number.isFinite(numericEpisodeId) || numericEpisodeId <= 0) {
      return NextResponse.json(
        { error: "A valid positive episode ID is required" },
        { status: 400 }
      );
    }

    // Rate limit check
    const rateLimit = await checkRateLimit(userId);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    // Check if we already have a cached summary in the database
    const existingEpisode = await db.query.episodes.findFirst({
      where: eq(episodes.podcastIndexId, episodeId.toString()),
    });

    if (existingEpisode?.summary && existingEpisode?.processedAt) {
      // Return cached summary
      return NextResponse.json({
        summary: existingEpisode.summary,
        keyTakeaways: existingEpisode.keyTakeaways || [],
        worthItScore: existingEpisode.worthItScore
          ? parseFloat(existingEpisode.worthItScore)
          : null,
        worthItReason: existingEpisode.worthItReason,
        cached: true,
      });
    }

    // Check if there's already a run in progress
    if (
      existingEpisode?.summaryRunId &&
      existingEpisode.summaryStatus &&
      IN_PROGRESS_STATUSES.includes(existingEpisode.summaryStatus)
    ) {
      // Generate a new public access token for the existing run
      const publicAccessToken = await auth.createPublicToken({
        scopes: {
          read: {
            runs: [existingEpisode.summaryRunId],
          },
        },
        expirationTime: "15m",
      });

      return NextResponse.json(
        {
          runId: existingEpisode.summaryRunId,
          publicAccessToken,
          status: existingEpisode.summaryStatus,
        },
        { status: 202 }
      );
    }

    // Trigger the summarization task (idempotencyKey prevents duplicate runs)
    const handle = await tasks.trigger<typeof summarizeEpisode>(
      "summarize-episode",
      { episodeId: numericEpisodeId },
      { idempotencyKey: `summarize-episode-${numericEpisodeId}`, idempotencyKeyTTL: "10m" }
    );

    // Generate public access token for realtime frontend subscription
    const publicAccessToken = await auth.createPublicToken({
      scopes: {
        read: {
          runs: [handle.id],
        },
      },
      expirationTime: "15m",
    });

    // Store run ID and status on the episode row if it exists
    // If no episode row exists yet, the task will create it on completion
    if (existingEpisode) {
      await db
        .update(episodes)
        .set({
          summaryRunId: handle.id,
          summaryStatus: "queued",
          updatedAt: new Date(),
        })
        .where(eq(episodes.id, existingEpisode.id));
    }

    return NextResponse.json(
      {
        runId: handle.id,
        publicAccessToken,
        status: "queued",
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("Error triggering summary:", error);
    return NextResponse.json(
      {
        error: "Failed to trigger summary generation",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check if a summary exists
export async function GET(request: NextRequest) {
  try {
    const { userId } = await clerkAuth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const episodeId = searchParams.get("episodeId");

    if (!episodeId) {
      return NextResponse.json(
        { error: "Episode ID is required" },
        { status: 400 }
      );
    }

    // Check if we have a cached summary
    const existingEpisode = await db.query.episodes.findFirst({
      where: eq(episodes.podcastIndexId, episodeId),
    });

    if (existingEpisode?.summary && existingEpisode?.processedAt) {
      return NextResponse.json({
        exists: true,
        summary: existingEpisode.summary,
        keyTakeaways: existingEpisode.keyTakeaways || [],
        worthItScore: existingEpisode.worthItScore
          ? parseFloat(existingEpisode.worthItScore)
          : null,
        worthItReason: existingEpisode.worthItReason,
        processedAt: existingEpisode.processedAt,
      });
    }

    // Check if there's an in-progress run
    if (
      existingEpisode?.summaryRunId &&
      existingEpisode.summaryStatus &&
      IN_PROGRESS_STATUSES.includes(existingEpisode.summaryStatus)
    ) {
      const publicAccessToken = await auth.createPublicToken({
        scopes: {
          read: {
            runs: [existingEpisode.summaryRunId],
          },
        },
        expirationTime: "15m",
      });

      return NextResponse.json({
        exists: false,
        status: existingEpisode.summaryStatus,
        runId: existingEpisode.summaryRunId,
        publicAccessToken,
      });
    }

    // Return error info for failed episodes
    if (existingEpisode?.summaryStatus === "failed") {
      return NextResponse.json({
        exists: false,
        status: "failed",
        processingError: existingEpisode.processingError,
      });
    }

    return NextResponse.json({
      exists: false,
    });
  } catch (error) {
    console.error("Error checking summary:", error);
    return NextResponse.json(
      { error: "Failed to check summary" },
      { status: 500 }
    );
  }
}
