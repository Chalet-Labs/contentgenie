import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, userSubscriptions } from "@/db/schema";
import { upsertPodcast } from "@/db/helpers";
import { revalidatePath } from "next/cache";
import { getClerkEmail } from "@/lib/clerk-helpers";
import { subscribeSchema } from "@/lib/schemas/library";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
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

    let latestEpisodeDateValue: Date | undefined;
    if (latestEpisodeDate != null) {
      const d = new Date(latestEpisodeDate);
      if (!isNaN(d.getTime())) {
        latestEpisodeDateValue = d;
      }
    }

    // Ensure user exists
    const email = await getClerkEmail(userId);
    await db
      .insert(users)
      .values({ id: userId, email, name: null })
      .onConflictDoNothing();

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
      }, { updateOnConflict: false }),
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
