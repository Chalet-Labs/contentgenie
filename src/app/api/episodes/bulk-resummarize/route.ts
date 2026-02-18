import { NextRequest, NextResponse } from "next/server";
import { auth as clerkAuth } from "@clerk/nextjs/server";
import { tasks, auth, runs } from "@trigger.dev/sdk";
import { and, isNotNull, lte, gte, eq, count } from "drizzle-orm";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import { createRateLimitChecker } from "@/lib/rate-limit";
import type { bulkResummarize } from "@/trigger/bulk-resummarize";

const checkBulkRateLimit = createRateLimitChecker({
  points: 1,
  duration: 3600,
  keyPrefix: "bulk-resummarize",
});

export async function POST(request: NextRequest) {
  try {
    const { userId } = await clerkAuth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { podcastId, minDate, maxDate, maxScore, all } = body;

    // Validate: at least one filter OR explicit all: true
    const hasFilter =
      podcastId !== undefined ||
      minDate !== undefined ||
      maxDate !== undefined ||
      maxScore !== undefined;

    if (!hasFilter && all !== true) {
      return NextResponse.json(
        { error: "At least one filter is required, or set all: true to re-summarize all episodes" },
        { status: 400 }
      );
    }

    // Validate individual filter values
    if (podcastId !== undefined) {
      if (typeof podcastId !== "number" || !Number.isInteger(podcastId) || podcastId <= 0) {
        return NextResponse.json(
          { error: "podcastId must be a positive integer" },
          { status: 400 }
        );
      }
    }

    if (minDate !== undefined) {
      if (typeof minDate !== "string" || isNaN(Date.parse(minDate))) {
        return NextResponse.json(
          { error: "minDate must be a valid ISO date string" },
          { status: 400 }
        );
      }
    }

    if (maxDate !== undefined) {
      if (typeof maxDate !== "string" || isNaN(Date.parse(maxDate))) {
        return NextResponse.json(
          { error: "maxDate must be a valid ISO date string" },
          { status: 400 }
        );
      }
    }

    if (maxScore !== undefined) {
      if (typeof maxScore !== "number" || !Number.isFinite(maxScore) || maxScore < 0 || maxScore > 10) {
        return NextResponse.json(
          { error: "maxScore must be a number between 0 and 10" },
          { status: 400 }
        );
      }
    }

    // Rate limit check
    const rateLimit = await checkBulkRateLimit(userId);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Only 1 bulk re-summarization per hour." },
        { status: 429 }
      );
    }

    // Count matching episodes for estimate
    const conditions = [isNotNull(episodes.processedAt)];

    if (podcastId !== undefined) {
      conditions.push(eq(episodes.podcastId, podcastId));
    }
    if (minDate) {
      conditions.push(gte(episodes.publishDate, new Date(minDate)));
    }
    if (maxDate) {
      conditions.push(lte(episodes.publishDate, new Date(maxDate)));
    }
    if (maxScore !== undefined) {
      conditions.push(lte(episodes.worthItScore, String(maxScore)));
    }

    const [countResult] = await db
      .select({ count: count() })
      .from(episodes)
      .where(and(...conditions));

    const estimatedEpisodes = countResult.count;

    // Trigger the bulk-resummarize task
    const handle = await tasks.trigger<typeof bulkResummarize>(
      "bulk-resummarize",
      { podcastId, minDate, maxDate, maxScore, all }
    );

    // Dynamic token expiry: scale with expected processing time
    // 3 concurrent * ~2 min each = ~2/3 min per episode
    const expiryMinutes = Math.min(60, Math.max(15, Math.ceil(estimatedEpisodes / 3 * 2)));
    const publicAccessToken = await auth.createPublicToken({
      scopes: {
        read: {
          runs: [handle.id],
        },
      },
      expirationTime: `${expiryMinutes}m`,
    });

    return NextResponse.json(
      {
        runId: handle.id,
        publicAccessToken,
        estimatedEpisodes,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("Error triggering bulk re-summarization:", error);
    return NextResponse.json(
      {
        error: "Failed to trigger bulk re-summarization",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await clerkAuth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { runId } = body;

    if (!runId || typeof runId !== "string") {
      return NextResponse.json(
        { error: "runId is required" },
        { status: 400 }
      );
    }

    await runs.cancel(runId);

    return NextResponse.json({ canceled: true });
  } catch (error) {
    console.error("Error canceling bulk re-summarization:", error);
    return NextResponse.json(
      {
        error: "Failed to cancel bulk re-summarization",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
