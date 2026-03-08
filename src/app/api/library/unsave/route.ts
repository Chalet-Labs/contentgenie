import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { episodes, userLibrary } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { unsaveEpisodeSchema } from "@/lib/schemas/library";

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

    const result = unsaveEpisodeSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: "Invalid episode data: podcastIndexId is required" },
        { status: 400 },
      );
    }

    const { podcastIndexId } = result.data;

    const episode = await db.query.episodes.findFirst({
      where: eq(episodes.podcastIndexId, podcastIndexId),
      columns: { id: true },
    });

    if (!episode) {
      return NextResponse.json(
        { success: false, error: "Episode not found" },
        { status: 404 },
      );
    }

    await db
      .delete(userLibrary)
      .where(
        and(
          eq(userLibrary.userId, userId),
          eq(userLibrary.episodeId, episode.id),
        ),
      );

    revalidatePath("/library");
    revalidatePath(`/episode/${podcastIndexId}`);

    return NextResponse.json({ success: true, message: "Episode removed from library" });
  } catch (error) {
    console.error("Error removing episode from library:", error);
    return NextResponse.json(
      { success: false, error: "Failed to remove episode" },
      { status: 500 },
    );
  }
}
