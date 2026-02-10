import { NextRequest, NextResponse } from "next/server";
import {
  searchPodcasts,
  searchByPerson,
  type PodcastSearchResult,
} from "@/lib/podcastindex";
import { searchLocalPodcasts } from "@/lib/podcast-search";

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

    const [bytermResult, bypersonResult, localResult] =
      await Promise.allSettled([
        searchPodcasts(query, maxResults, { similar: true }),
        searchByPerson(query, 5),
        searchLocalPodcasts(query),
      ]);

    const merged: PodcastSearchResult[] = [];
    const seenIds = new Set<string>();

    // Layer 1a: byterm results (primary)
    if (bytermResult.status === "fulfilled") {
      for (const feed of bytermResult.value.feeds ?? []) {
        const id = String(feed.id);
        if (!seenIds.has(id)) {
          seenIds.add(id);
          merged.push(feed);
        }
      }
    }

    // Layer 1b: byperson results (extract unique feedIds from episodes)
    if (bypersonResult.status === "fulfilled") {
      const feedMap = new Map<
        string,
        { feedId: number; feedImage: string; title: string }
      >();
      for (const episode of bypersonResult.value.items ?? []) {
        const feedId = String(episode.feedId);
        if (!seenIds.has(feedId) && !feedMap.has(feedId)) {
          feedMap.set(feedId, {
            feedId: episode.feedId,
            feedImage: episode.feedImage,
            title: episode.feedTitle ?? episode.title,
          });
        }
      }
      feedMap.forEach((info, feedId) => {
        seenIds.add(feedId);
        merged.push({
          id: info.feedId,
          title: info.title,
          image: info.feedImage,
          artwork: info.feedImage,
        });
      });
    }

    // Layer 2: local fuzzy index results (supplementary)
    if (localResult.status === "fulfilled") {
      for (const local of localResult.value) {
        const numericId = Number(local.podcastIndexId);
        if (!Number.isFinite(numericId)) continue;
        if (!seenIds.has(local.podcastIndexId)) {
          seenIds.add(local.podcastIndexId);
          merged.push({
            id: numericId,
            title: local.title,
            author: local.publisher ?? "",
          });
        }
      }
    }

    const capped = merged.slice(0, maxResults);

    return NextResponse.json({
      podcasts: capped,
      count: capped.length,
      query,
    });
  } catch (error) {
    console.error("Podcast search error:", error);
    return NextResponse.json(
      { error: "Failed to search podcasts" },
      { status: 500 }
    );
  }
}
