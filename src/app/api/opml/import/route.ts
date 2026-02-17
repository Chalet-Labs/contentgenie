import { NextRequest, NextResponse } from "next/server";
import { auth as clerkAuth, currentUser } from "@clerk/nextjs/server";
import { tasks, auth } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { podcasts, userSubscriptions } from "@/db/schema";
import { parseOpml } from "@/lib/opml";
import { importOpml } from "@/trigger/import-opml";
import { createRateLimitChecker } from "@/lib/rate-limit";

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB

// Per-user rate limit: 1 import per 5 minutes (distributed via Postgres, per ADR-001)
const checkImportRateLimit = createRateLimitChecker({
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

    // Fetch user email from Clerk for the background task's defensive user insert
    const user = await currentUser();
    const userEmail =
      user?.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)
        ?.emailAddress ??
      user?.emailAddresses?.[0]?.emailAddress ??
      "";

    if (!userEmail) {
      console.warn("No email found for user during OPML import", { userId });
      return NextResponse.json(
        { error: "Unable to resolve user email. Please try again." },
        { status: 400 }
      );
    }

    // Rate limit check (distributed via Postgres)
    const rateLimit = await checkImportRateLimit(userId);
    if (!rateLimit.allowed) {
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
        .map((url) => url.toLowerCase())
    );

    // Filter out already-subscribed feeds (case-insensitive URL comparison)
    const newFeeds = feeds.filter(
      (f) => !subscribedUrls.has(f.feedUrl.toLowerCase())
    );
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
      userEmail,
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
      },
      { status: 500 }
    );
  }
}
