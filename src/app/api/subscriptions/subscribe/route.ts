import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { userSubscriptions } from "@/db/schema";
import { upsertPodcast, ensureUserExists } from "@/db/helpers";
import { revalidatePath } from "next/cache";
import { subscribeSchema, safeParseDate } from "@/lib/schemas/library";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { success: false, error: "Unsupported Media Type" },
        { status: 415 },
      );
    }

    const accept = request.headers.get("accept")?.toLowerCase() ?? "*/*";
    if (!accept.includes("application/json") && !accept.includes("*/*")) {
      return NextResponse.json(
        { success: false, error: "Not Acceptable" },
        { status: 406 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const result = subscribeSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: "Invalid podcast data" },
        { status: 400 },
      );
    }

    const {
      podcastIndexId, title, description, publisher,
      imageUrl, rssFeedUrl, categories, totalEpisodes, latestEpisodeDate,
    } = result.data;

    const latestEpisodeDateValue = safeParseDate(latestEpisodeDate);

    await ensureUserExists(userId);

    // Upsert podcast
    const podcast = {
      id: await upsertPodcast({
        podcastIndexId,
        title,
        description,
        publisher,
        imageUrl,
        rssFeedUrl,
        categories,
        totalEpisodes,
        latestEpisodeDate: latestEpisodeDateValue,
      }, { updateOnConflict: "safe" }),
    };

    // Insert subscription (idempotent)
    const subResult = await db
      .insert(userSubscriptions)
      .values({ userId, podcastId: podcast.id })
      .onConflictDoNothing()
      .returning({ id: userSubscriptions.id });

    if (subResult.length === 0) {
      return NextResponse.json({ success: true, message: "Already subscribed" });
    }

    revalidatePath("/subscriptions");
    revalidatePath(`/podcast/${podcastIndexId}`);

    return NextResponse.json({ success: true, message: "Subscribed successfully" });
  } catch (error) {
    console.error("Error subscribing to podcast:", error);
    return NextResponse.json(
      { success: false, error: "Failed to subscribe" },
      { status: 500 },
    );
  }
}
