import { NextRequest, NextResponse } from "next/server";
import { auth as clerkAuth } from "@clerk/nextjs/server";
import { tasks, auth } from "@trigger.dev/sdk";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import type { batchSummarizeEpisodes } from "@/trigger/batch-summarize-episodes";

// Simple in-memory rate limiter (per-instance; sufficient as first defense)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 10; // 10 summarizations per hour per user

function checkRateLimit(userId: string, count: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    if (count > RATE_LIMIT_MAX) return false;
    rateLimitMap.set(userId, { count, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count + count > RATE_LIMIT_MAX) {
    return false;
  }
  entry.count += count;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const { userId } = await clerkAuth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const { episodeIds } = body;

    if (!Array.isArray(episodeIds) || episodeIds.length === 0) {
      return NextResponse.json(
        { error: "episodeIds must be a non-empty array" },
        { status: 400 }
      );
    }

    if (episodeIds.length > 20) {
      return NextResponse.json(
        { error: "Maximum 20 episodes per batch" },
        { status: 400 }
      );
    }

    if (
      !episodeIds.every(
        (id: unknown) =>
          typeof id === "number" && Number.isFinite(id) && id > 0
      )
    ) {
      return NextResponse.json(
        { error: "All episode IDs must be positive numbers" },
        { status: 400 }
      );
    }

    // Query DB for already-processed episodes
    const existingEpisodes = await db.query.episodes.findMany({
      where: inArray(
        episodes.podcastIndexId,
        episodeIds.map(String)
      ),
      columns: { podcastIndexId: true, processedAt: true },
    });

    const cachedIds = new Set(
      existingEpisodes
        .filter((e) => e.processedAt !== null)
        .map((e) => Number(e.podcastIndexId))
    );

    const cachedCount = episodeIds.filter((id: number) =>
      cachedIds.has(id)
    ).length;

    // If all episodes are already cached, return immediately
    if (cachedCount === episodeIds.length) {
      return NextResponse.json({
        total: episodeIds.length,
        skipped: episodeIds.length,
        alreadyCached: true,
      });
    }

    const uncachedCount = episodeIds.length - cachedCount;

    // Rate limit check (only count uncached episodes against quota)
    if (!checkRateLimit(userId, uncachedCount)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    // Trigger the batch summarization task
    const handle = await tasks.trigger<typeof batchSummarizeEpisodes>(
      "batch-summarize-episodes",
      { episodeIds }
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

    return NextResponse.json(
      {
        runId: handle.id,
        publicAccessToken,
        total: episodeIds.length,
        skipped: cachedCount,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("Error triggering batch summarization:", error);
    return NextResponse.json(
      {
        error: "Failed to trigger batch summarization",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
