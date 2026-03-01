import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, podcasts, userSubscriptions } from "@/db/schema";
import { revalidatePath } from "next/cache";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const podcastIndexId = body.podcastIndexId;
    const title = body.title;

    if (
      !podcastIndexId ||
      typeof podcastIndexId !== "string" ||
      !title ||
      typeof title !== "string"
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid podcast data" },
        { status: 400 },
      );
    }

    const description = typeof body.description === "string" ? body.description : undefined;
    const publisher = typeof body.publisher === "string" ? body.publisher : undefined;
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : undefined;
    const rssFeedUrl = typeof body.rssFeedUrl === "string" ? body.rssFeedUrl : undefined;
    const categories =
      Array.isArray(body.categories) && body.categories.every((c) => typeof c === "string")
        ? (body.categories as string[])
        : undefined;
    const totalEpisodes = typeof body.totalEpisodes === "number" ? body.totalEpisodes : undefined;
    let latestEpisodeDate: Date | undefined;
    if (body.latestEpisodeDate != null) {
      const d = new Date(body.latestEpisodeDate as string | number);
      if (!isNaN(d.getTime())) {
        latestEpisodeDate = d;
      }
    }

    // Ensure user exists
    await db
      .insert(users)
      .values({ id: userId, email: "", name: null })
      .onConflictDoNothing();

    // Upsert podcast
    const [podcast] = await db
      .insert(podcasts)
      .values({
        podcastIndexId,
        title,
        description,
        publisher,
        imageUrl,
        rssFeedUrl,
        categories,
        totalEpisodes,
        latestEpisodeDate,
      })
      .onConflictDoUpdate({
        target: podcasts.podcastIndexId,
        set: {
          title,
          description,
          publisher,
          imageUrl,
          rssFeedUrl,
          categories,
          totalEpisodes,
          latestEpisodeDate,
          updatedAt: new Date(),
        },
      })
      .returning({ id: podcasts.id });

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
