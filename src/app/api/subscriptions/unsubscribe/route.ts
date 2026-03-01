import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { podcasts, userSubscriptions } from "@/db/schema";
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
    const { podcastIndexId } = body;

    if (!podcastIndexId || typeof podcastIndexId !== "string") {
      return NextResponse.json(
        { success: false, error: "Invalid podcast data: podcastIndexId is required" },
        { status: 400 },
      );
    }

    const podcast = await db.query.podcasts.findFirst({
      where: eq(podcasts.podcastIndexId, podcastIndexId),
      columns: { id: true },
    });

    if (!podcast) {
      return NextResponse.json(
        { success: false, error: "Podcast not found" },
        { status: 404 },
      );
    }

    await db
      .delete(userSubscriptions)
      .where(
        and(
          eq(userSubscriptions.userId, userId),
          eq(userSubscriptions.podcastId, podcast.id),
        ),
      );

    revalidatePath("/subscriptions");
    revalidatePath(`/podcast/${podcastIndexId}`);

    return NextResponse.json({ success: true, message: "Unsubscribed successfully" });
  } catch (error) {
    console.error("Error unsubscribing from podcast:", error);
    return NextResponse.json(
      { success: false, error: "Failed to unsubscribe" },
      { status: 500 },
    );
  }
}
