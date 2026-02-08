"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db";
import { users, podcasts, episodes, userSubscriptions } from "@/db/schema";
import {
  parsePodcastFeed,
  generatePodcastSyntheticId,
  generateEpisodeSyntheticId,
} from "@/lib/rss";

const MAX_EPISODES_PER_IMPORT = 50;

interface AddByRssResult {
  success: boolean;
  error?: string;
  message?: string;
  podcastIndexId?: string;
  title?: string;
  episodeCount?: number;
}

function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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
  if (!trimmedUrl || !isValidUrl(trimmedUrl)) {
    return {
      success: false,
      error: "Please enter a valid RSS feed URL",
    };
  }

  try {
    const syntheticPodcastId = generatePodcastSyntheticId(trimmedUrl);

    // Check if podcast already exists
    const existingPodcast = await db.query.podcasts.findFirst({
      where: eq(podcasts.podcastIndexId, syntheticPodcastId),
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
      const inserted = await db
        .insert(episodes)
        .values(episodeValues)
        .onConflictDoNothing()
        .returning({ id: episodes.id });
      insertedCount = inserted.length;
    }

    // Create subscription (onConflictDoNothing handles race conditions)
    await db
      .insert(userSubscriptions)
      .values({ userId, podcastId })
      .onConflictDoNothing();

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
    const podcast = await db.query.podcasts.findFirst({
      where: eq(podcasts.podcastIndexId, podcastIndexId),
    });

    if (!podcast) {
      return false;
    }

    const subscription = await db.query.userSubscriptions.findFirst({
      where: and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.podcastId, podcast.id)
      ),
    });

    return !!subscription;
  } catch (error) {
    console.error("Error checking subscription status:", error);
    return false;
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
