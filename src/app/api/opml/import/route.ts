import { NextRequest, NextResponse } from "next/server";
import { auth as clerkAuth } from "@clerk/nextjs/server";
import { tasks, auth } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { podcasts, userSubscriptions } from "@/db/schema";
import { parseOpml } from "@/lib/opml";
import type { importOpml } from "@/trigger/import-opml";
import { RateLimiterMemory } from "rate-limiter-flexible";

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB

// Per-user rate limit: 1 import per 5 minutes
const importLimiter = new RateLimiterMemory({
  points: 1,
  duration: 300, // 5 minutes
  keyPrefix: "opml-import",
});

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const { userId } = await clerkAuth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit check
    try {
      await importLimiter.consume(userId);
    } catch {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a few minutes before importing again." },
        { status: 429 }
      );
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("opmlFile");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "An OPML file is required" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File is too large. Maximum size is 1MB." },
        { status: 400 }
      );
    }

    // Read and parse OPML file
    const xmlContent = await file.text();
    let feeds;
    try {
      feeds = parseOpml(xmlContent);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to parse OPML file",
        },
        { status: 400 }
      );
    }

    const total = feeds.length;

    // Query existing user subscriptions to find already-subscribed feed URLs
    const existingSubscriptions = await db
      .select({
        rssFeedUrl: podcasts.rssFeedUrl,
      })
      .from(userSubscriptions)
      .innerJoin(podcasts, eq(userSubscriptions.podcastId, podcasts.id))
      .where(eq(userSubscriptions.userId, userId));

    const subscribedUrls = new Set(
      existingSubscriptions
        .map((s) => s.rssFeedUrl)
        .filter((url): url is string => url !== null)
    );

    // Filter out already-subscribed feeds
    const newFeeds = feeds.filter((f) => !subscribedUrls.has(f.feedUrl));
    const alreadySubscribed = total - newFeeds.length;

    // If all feeds are already subscribed, return immediately
    if (newFeeds.length === 0) {
      return NextResponse.json({
        total,
        alreadySubscribed: total,
      });
    }

    // Trigger the import task
    const handle = await tasks.trigger<typeof importOpml>("import-opml", {
      userId,
      feeds: newFeeds,
      alreadySubscribedCount: alreadySubscribed,
    });

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
        total,
        alreadySubscribed,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("Error processing OPML import:", error);
    return NextResponse.json(
      {
        error: "Failed to process OPML import",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
