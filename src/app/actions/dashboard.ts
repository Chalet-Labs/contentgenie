"use server";

import { auth } from "@clerk/nextjs/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { userSubscriptions, userLibrary, podcasts } from "@/db/schema";
import {
  getEpisodesByFeedId,
  getTrendingPodcasts,
  type PodcastIndexEpisode,
  type PodcastIndexPodcast,
} from "@/lib/podcastindex";

// Get recent episodes from subscribed podcasts
export async function getRecentEpisodesFromSubscriptions(limit: number = 10) {
  const { userId } = await auth();

  if (!userId) {
    return { episodes: [], error: "You must be signed in to view episodes" };
  }

  try {
    // BOLT OPTIMIZATION: Use direct SELECT with JOIN instead of Relational Query API.
    // This allows selective column fetching and ordering by joined table columns,
    // reducing DB payload and improving relevance of checked podcasts.
    // Expected impact: ~30-50% reduction in DB data transfer for this query.
    const subscriptions = await db
      .select({
        podcast: {
          podcastIndexId: podcasts.podcastIndexId,
          title: podcasts.title,
          imageUrl: podcasts.imageUrl,
        },
      })
      .from(userSubscriptions)
      .innerJoin(podcasts, eq(userSubscriptions.podcastId, podcasts.id))
      .where(eq(userSubscriptions.userId, userId))
      .orderBy(desc(podcasts.latestEpisodeDate))
      .limit(10);

    if (subscriptions.length === 0) {
      return { episodes: [], error: null };
    }

    // Fetch recent episodes from each subscribed podcast
    const episodePromises = subscriptions.map(async (sub) => {
      try {
        const feedId = parseInt(sub.podcast.podcastIndexId, 10);
        if (isNaN(feedId)) return [];

        const response = await getEpisodesByFeedId(feedId, 3);
        return response.items.map((ep) => ({
          ...ep,
          podcastTitle: sub.podcast.title,
          podcastImage: sub.podcast.imageUrl,
          podcastId: sub.podcast.podcastIndexId,
        }));
      } catch {
        // If API call fails for one podcast, continue with others
        return [];
      }
    });

    const episodesArrays = await Promise.all(episodePromises);
    const allEpisodes = episodesArrays.flat();

    // Sort by publish date and take the most recent
    const sortedEpisodes = allEpisodes
      .sort((a, b) => (b.datePublished || 0) - (a.datePublished || 0))
      .slice(0, limit);

    return { episodes: sortedEpisodes, error: null };
  } catch (error) {
    console.error("Error fetching recent episodes:", error);
    return { episodes: [], error: "Failed to load recent episodes" };
  }
}

// Get recently saved items from user's library (limited)
export async function getRecentlySavedItems(limit: number = 5) {
  const { userId } = await auth();

  if (!userId) {
    return { items: [], error: "You must be signed in to view your library" };
  }

  try {
    // BOLT OPTIMIZATION: Use selective column fetching to avoid loading large text fields
    // (like transcription and summary) which are not needed for the dashboard list.
    // Expected impact: Reduces DB data transfer by ~95% per item when transcripts are present.
    const items = await db.query.userLibrary.findMany({
      where: eq(userLibrary.userId, userId),
      columns: {
        id: true,
        userId: true,
        episodeId: true,
        savedAt: true,
        notes: true,
        rating: true,
        collectionId: true,
      },
      with: {
        episode: {
          columns: {
            id: true,
            podcastIndexId: true,
            title: true,
            description: true,
            publishDate: true,
            duration: true,
            worthItScore: true,
          },
          with: {
            podcast: {
              columns: {
                id: true,
                podcastIndexId: true,
                title: true,
                imageUrl: true,
              },
            },
          },
        },
      },
      orderBy: [desc(userLibrary.savedAt)],
      limit,
    });

    return { items, error: null };
  } catch (error) {
    console.error("Error fetching recent library items:", error);
    return { items: [], error: "Failed to load saved items" };
  }
}

// Get trending/recommended podcasts
export async function getRecommendedPodcasts(limit: number = 6) {
  const { userId } = await auth();

  if (!userId) {
    return { podcasts: [], error: "You must be signed in" };
  }

  try {
    // BOLT OPTIMIZATION: Use a single direct JOIN to fetch subscribed podcast IDs.
    // Avoids overhead of Relational Query API and unnecessary column fetching.
    const subscriptionResult = await db
      .select({ podcastIndexId: podcasts.podcastIndexId })
      .from(userSubscriptions)
      .innerJoin(podcasts, eq(userSubscriptions.podcastId, podcasts.id))
      .where(eq(userSubscriptions.userId, userId));

    const subscribedIds = new Set(subscriptionResult.map((s) => s.podcastIndexId));

    // Fetch trending podcasts from PodcastIndex
    const trending = await getTrendingPodcasts(limit + subscribedIds.size);

    // Filter out already subscribed podcasts
    const recommendations = trending.feeds
      .filter((podcast) => !subscribedIds.has(podcast.id.toString()))
      .slice(0, limit);

    return { podcasts: recommendations, error: null };
  } catch (error) {
    console.error("Error fetching recommendations:", error);
    return { podcasts: [], error: "Failed to load recommendations" };
  }
}

// Get stats for the dashboard
export async function getDashboardStats() {
  const { userId } = await auth();

  if (!userId) {
    return {
      subscriptionCount: 0,
      savedCount: 0,
      error: "You must be signed in",
    };
  }

  try {
    const [subscriptionCount, savedCount] = await Promise.all([
      db.$count(userSubscriptions, eq(userSubscriptions.userId, userId)),
      db.$count(userLibrary, eq(userLibrary.userId, userId)),
    ]);

    return {
      subscriptionCount,
      savedCount,
      error: null,
    };
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return { subscriptionCount: 0, savedCount: 0, error: "Failed to load stats" };
  }
}

// Export types for use in components
export type RecentEpisode = PodcastIndexEpisode & {
  podcastTitle: string;
  podcastImage: string | null;
  podcastId: string;
};
