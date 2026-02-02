"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { users, podcasts, userSubscriptions } from "@/db/schema";

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
