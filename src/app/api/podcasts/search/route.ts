import { NextRequest, NextResponse } from "next/server";
import { searchPodcasts } from "@/lib/podcastindex";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");
  const max = searchParams.get("max");

  if (!query) {
    return NextResponse.json(
      { error: "Search query is required" },
      { status: 400 }
    );
  }

  if (!process.env.PODCASTINDEX_API_KEY || !process.env.PODCASTINDEX_API_SECRET) {
    return NextResponse.json(
      { error: "PodcastIndex API credentials not configured" },
      { status: 500 }
    );
  }

  try {
    const maxResults = max ? parseInt(max, 10) : 20;
    const results = await searchPodcasts(query, maxResults);

    return NextResponse.json({
      podcasts: results.feeds || [],
      count: results.count || 0,
      query: results.query,
    });
  } catch (error) {
    console.error("Podcast search error:", error);
    return NextResponse.json(
      { error: "Failed to search podcasts" },
      { status: 500 }
    );
  }
}
