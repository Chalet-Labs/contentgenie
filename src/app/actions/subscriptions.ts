"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, podcasts, episodes, userSubscriptions } from "@/db/schema";
import {
  parsePodcastFeed,
  generatePodcastSyntheticId,
  generateEpisodeSyntheticId,
} from "@/lib/rss";
import { isSafeUrl } from "@/lib/security";

const MAX_EPISODES_PER_IMPORT = 50;

interface AddByRssResult {
  success: boolean;
  error?: string;
  message?: string;
  podcastIndexId?: string;
  title?: string;
  episodeCount?: number;
}

// Add a podcast by RSS feed URL
export async function addPodcastByRssUrl(
  feedUrl: string,
): Promise<AddByRssResult> {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: "You must be signed in to add a podcast" };
  }

  const trimmedUrl = feedUrl.trim();
  if (!trimmedUrl || !(await isSafeUrl(trimmedUrl))) {
    return {
      success: false,
      error: "Please enter a valid and safe RSS feed URL",
    };
  }

  try {
    const syntheticPodcastId = generatePodcastSyntheticId(trimmedUrl);

    // Check if podcast already exists
    const existingPodcast = await db.query.podcasts.findFirst({
      where: eq(podcasts.podcastIndexId, syntheticPodcastId),
      columns: { id: true, title: true },
    });

    if (existingPodcast) {
      // Podcast exists — just ensure subscription
      await db
        .insert(users)
        .values({ id: userId, email: "" })
        .onConflictDoNothing();

      const existingSub = await db.query.userSubscriptions.findFirst({
        where: and(
          eq(userSubscriptions.userId, userId),
          eq(userSubscriptions.podcastId, existingPodcast.id),
        ),
      });

      if (existingSub) {
        return {
          success: true,
          message: "Already subscribed",
          podcastIndexId: syntheticPodcastId,
          title: existingPodcast.title,
        };
      }

      await db.insert(userSubscriptions).values({
        userId,
        podcastId: existingPodcast.id,
      });

      revalidatePath("/subscriptions");
      revalidatePath("/discover");

      return {
        success: true,
        message: "Subscribed successfully",
        podcastIndexId: syntheticPodcastId,
        title: existingPodcast.title,
      };
    }

    // Parse the RSS feed
    let feed;
    try {
      feed = await parsePodcastFeed(trimmedUrl);
    } catch {
      return {
        success: false,
        error:
          "Could not parse the RSS feed. Check the URL and try again.",
      };
    }

    // Ensure user exists
    await db
      .insert(users)
      .values({ id: userId, email: "" })
      .onConflictDoNothing();

    // Insert podcast (onConflictDoNothing handles race conditions)
    const insertResult = await db
      .insert(podcasts)
      .values({
        podcastIndexId: syntheticPodcastId,
        title: feed.title,
        description: feed.description,
        publisher: feed.author,
        imageUrl: feed.imageUrl,
        rssFeedUrl: trimmedUrl,
        source: "rss",
      })
      .onConflictDoNothing()
      .returning({ id: podcasts.id });

    // If insert was a no-op (race condition), re-query for the existing podcast
    let podcastId: number;
    if (insertResult.length > 0) {
      podcastId = insertResult[0].id;
    } else {
      const existing = await db.query.podcasts.findFirst({
        where: eq(podcasts.podcastIndexId, syntheticPodcastId),
        columns: { id: true },
      });
      if (!existing) {
        return { success: false, error: "Failed to add podcast. Please try again." };
      }
      podcastId = existing.id;
    }

    // Insert episodes in batch (up to MAX_EPISODES_PER_IMPORT, newest first)
    const sortedEpisodes = [...feed.episodes].sort((a, b) => {
      const dateA = a.publishDate?.getTime() ?? 0;
      const dateB = b.publishDate?.getTime() ?? 0;
      return dateB - dateA;
    });
    const episodesToInsert = sortedEpisodes.slice(0, MAX_EPISODES_PER_IMPORT);

    let insertedCount = 0;
    if (episodesToInsert.length > 0) {
      const episodeValues = episodesToInsert.map((ep) => ({
        podcastId,
        podcastIndexId: generateEpisodeSyntheticId(trimmedUrl, ep.guid),
        title: ep.title,
        description: ep.description,
        audioUrl: ep.audioUrl,
        duration: ep.duration,
        publishDate: ep.publishDate,
        rssGuid: ep.guid,
      }));
      // Batch episode insert + subscription insert atomically
      const [insertedEpisodes] = await db.batch([
        db
          .insert(episodes)
          .values(episodeValues)
          .onConflictDoNothing()
          .returning({ id: episodes.id }),
        db
          .insert(userSubscriptions)
          .values({ userId, podcastId })
          .onConflictDoNothing(),
      ]);
      insertedCount = insertedEpisodes.length;
    } else {
      // No episodes to insert — just create subscription
      await db
        .insert(userSubscriptions)
        .values({ userId, podcastId })
        .onConflictDoNothing();
    }

    revalidatePath("/subscriptions");
    revalidatePath("/discover");

    return {
      success: true,
      message: "Subscribed successfully",
      podcastIndexId: syntheticPodcastId,
      title: feed.title,
      episodeCount: insertedCount,
    };
  } catch (error) {
    console.error("Error adding podcast by RSS:", error);
    return {
      success: false,
      error: "Failed to add podcast. Please try again.",
    };
  }
}

interface PodcastData {
  podcastIndexId: string;
  title: string;
  description?: string;
  publisher?: string;
  imageUrl?: string;
  rssFeedUrl?: string;
  categories?: string[];
  totalEpisodes?: number;
  latestEpisodeDate?: Date;
}

// Subscribe to a podcast
export async function subscribeToPodcast(podcastData: PodcastData) {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: "You must be signed in to subscribe" };
  }

  try {
    // Ensure user exists in our database
    await db
      .insert(users)
      .values({
        id: userId,
        email: "", // Will be updated by webhook or next sync
        name: null,
      })
      .onConflictDoNothing();

    // Ensure podcast exists in our database
    const existingPodcast = await db.query.podcasts.findFirst({
      where: eq(podcasts.podcastIndexId, podcastData.podcastIndexId),
      columns: { id: true },
    });

    let podcastId: number;

    if (existingPodcast) {
      podcastId = existingPodcast.id;
      // Update podcast info if needed
      await db
        .update(podcasts)
        .set({
          title: podcastData.title,
          description: podcastData.description,
          publisher: podcastData.publisher,
          imageUrl: podcastData.imageUrl,
          rssFeedUrl: podcastData.rssFeedUrl,
          categories: podcastData.categories,
          totalEpisodes: podcastData.totalEpisodes,
          latestEpisodeDate: podcastData.latestEpisodeDate,
          updatedAt: new Date(),
        })
        .where(eq(podcasts.id, podcastId));
    } else {
      // Insert new podcast
      const [newPodcast] = await db
        .insert(podcasts)
        .values({
          podcastIndexId: podcastData.podcastIndexId,
          title: podcastData.title,
          description: podcastData.description,
          publisher: podcastData.publisher,
          imageUrl: podcastData.imageUrl,
          rssFeedUrl: podcastData.rssFeedUrl,
          categories: podcastData.categories,
          totalEpisodes: podcastData.totalEpisodes,
          latestEpisodeDate: podcastData.latestEpisodeDate,
        })
        .returning({ id: podcasts.id });
      podcastId = newPodcast.id;
    }

    // Check if already subscribed
    const existingSubscription = await db.query.userSubscriptions.findFirst({
      where: and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.podcastId, podcastId)
      ),
    });

    if (existingSubscription) {
      return { success: true, message: "Already subscribed" };
    }

    // Create subscription
    await db.insert(userSubscriptions).values({
      userId,
      podcastId,
    });

    revalidatePath("/subscriptions");
    revalidatePath(`/podcast/${podcastData.podcastIndexId}`);

    return { success: true, message: "Subscribed successfully" };
  } catch (error) {
    console.error("Error subscribing to podcast:", error);
    return { success: false, error: "Failed to subscribe. Please try again." };
  }
}

// Unsubscribe from a podcast
export async function unsubscribeFromPodcast(podcastIndexId: string) {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: "You must be signed in to unsubscribe" };
  }

  try {
    // Find the podcast
    const podcast = await db.query.podcasts.findFirst({
      where: eq(podcasts.podcastIndexId, podcastIndexId),
      columns: { id: true },
    });

    if (!podcast) {
      return { success: false, error: "Podcast not found" };
    }

    // Delete subscription
    await db
      .delete(userSubscriptions)
      .where(
        and(
          eq(userSubscriptions.userId, userId),
          eq(userSubscriptions.podcastId, podcast.id)
        )
      );

    revalidatePath("/subscriptions");
    revalidatePath(`/podcast/${podcastIndexId}`);

    return { success: true, message: "Unsubscribed successfully" };
  } catch (error) {
    console.error("Error unsubscribing from podcast:", error);
    return { success: false, error: "Failed to unsubscribe. Please try again." };
  }
}

// Check if user is subscribed to a podcast
export async function isSubscribedToPodcast(
  podcastIndexId: string
): Promise<boolean> {
  const { userId } = await auth();

  if (!userId) {
    return false;
  }

  try {
    // Single JOIN replaces two sequential queries (podcast lookup + subscription lookup).
    const result = await db
      .select({ exists: sql`1` })
      .from(userSubscriptions)
      .innerJoin(podcasts, eq(userSubscriptions.podcastId, podcasts.id))
      .where(
        and(
          eq(userSubscriptions.userId, userId),
          eq(podcasts.podcastIndexId, podcastIndexId)
        )
      )
      .limit(1);

    return result.length > 0;
  } catch (error) {
    console.error("Error checking subscription status:", error);
    return false;
  }
}

export async function refreshPodcastFeed(podcastId: number) {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: "You must be signed in to refresh a feed" };
  }

  try {
    // Verify podcast exists
    const podcast = await db.query.podcasts.findFirst({
      where: eq(podcasts.id, podcastId),
    });

    if (!podcast) {
      return { success: false, error: "Podcast not found" };
    }

    // Early return for non-PodcastIndex sources
    if (podcast.source !== "podcastindex") {
      return {
        success: false,
        error: "Feed refresh is only available for PodcastIndex podcasts",
      };
    }

    // Verify user is subscribed
    const subscription = await db.query.userSubscriptions.findFirst({
      where: and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.podcastId, podcastId)
      ),
    });

    if (!subscription) {
      return {
        success: false,
        error: "You must be subscribed to refresh this feed",
      };
    }

    // Fetch latest episodes from PodcastIndex
    const { getEpisodesByFeedId } = await import("@/lib/podcastindex");
    const feedId = Number(podcast.podcastIndexId);
    const response = await getEpisodesByFeedId(feedId, 20);
    const fetchedEpisodes = response?.items ?? [];

    let newEpisodes: typeof fetchedEpisodes = [];
    if (fetchedEpisodes.length > 0) {
      // Deduplicate: find which episodes already exist in DB
      const fetchedIds = fetchedEpisodes.map((ep) => String(ep.id));
      const existingEpisodes = await db
        .select({ podcastIndexId: episodes.podcastIndexId })
        .from(episodes)
        .where(inArray(episodes.podcastIndexId, fetchedIds));

      const existingIds = new Set(existingEpisodes.map((e) => e.podcastIndexId));
      newEpisodes = fetchedEpisodes.filter(
        (ep) => !existingIds.has(String(ep.id))
      );

      // Trigger summarization for new episodes (fire-and-forget from server context)
      if (newEpisodes.length > 0) {
        const { tasks } = await import("@trigger.dev/sdk");
        const batchItems = newEpisodes.map((ep) => ({
          payload: { episodeId: Number(ep.id) },
          options: { idempotencyKey: `refresh-summarize-${ep.id}` },
        }));

        await tasks.batchTrigger(
          "summarize-episode",
          batchItems
        );
      }
    }

    // Update lastPolledAt
    await db
      .update(podcasts)
      .set({ lastPolledAt: new Date(), updatedAt: new Date() })
      .where(eq(podcasts.id, podcastId));

    revalidatePath(`/podcast/${podcast.podcastIndexId}`);
    revalidatePath("/subscriptions");

    return {
      success: true,
      message:
        newEpisodes.length > 0
          ? `Found ${newEpisodes.length} new episode(s)`
          : "Feed is up to date",
      newEpisodes: newEpisodes.length,
    };
  } catch (error) {
    console.error("Error refreshing podcast feed:", error);
    return {
      success: false,
      error: "Failed to refresh feed. Please try again.",
    };
  }
}

// Get all subscriptions for the current user
export async function getUserSubscriptions() {
  const { userId } = await auth();

  if (!userId) {
    return { subscriptions: [], error: "You must be signed in to view subscriptions" };
  }

  try {
    const subscriptions = await db.query.userSubscriptions.findMany({
      where: eq(userSubscriptions.userId, userId),
      with: {
        podcast: true,
      },
      orderBy: (userSubscriptions, { desc }) => [desc(userSubscriptions.subscribedAt)],
    });

    return { subscriptions, error: null };
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    return { subscriptions: [], error: "Failed to load subscriptions" };
  }
}
