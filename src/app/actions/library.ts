"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db";
import { users, podcasts, episodes, userLibrary } from "@/db/schema";

interface EpisodeData {
  podcastIndexId: string;
  title: string;
  description?: string;
  audioUrl?: string;
  duration?: number;
  publishDate?: Date;
  podcast: {
    podcastIndexId: string;
    title: string;
    description?: string;
    publisher?: string;
    imageUrl?: string;
    rssFeedUrl?: string;
    categories?: string[];
    totalEpisodes?: number;
  };
}

// Save an episode to the user's library
export async function saveEpisodeToLibrary(episodeData: EpisodeData) {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: "You must be signed in to save episodes" };
  }

  try {
    // Ensure user exists in our database
    await db
      .insert(users)
      .values({
        id: userId,
        email: "",
        name: null,
      })
      .onConflictDoNothing();

    // Ensure podcast exists in our database
    let podcast = await db.query.podcasts.findFirst({
      where: eq(podcasts.podcastIndexId, episodeData.podcast.podcastIndexId),
    });

    let podcastId: number;

    if (podcast) {
      podcastId = podcast.id;
    } else {
      const [newPodcast] = await db
        .insert(podcasts)
        .values({
          podcastIndexId: episodeData.podcast.podcastIndexId,
          title: episodeData.podcast.title,
          description: episodeData.podcast.description,
          publisher: episodeData.podcast.publisher,
          imageUrl: episodeData.podcast.imageUrl,
          rssFeedUrl: episodeData.podcast.rssFeedUrl,
          categories: episodeData.podcast.categories,
          totalEpisodes: episodeData.podcast.totalEpisodes,
        })
        .returning({ id: podcasts.id });
      podcastId = newPodcast.id;
    }

    // Ensure episode exists in our database
    let episode = await db.query.episodes.findFirst({
      where: eq(episodes.podcastIndexId, episodeData.podcastIndexId),
    });

    let episodeId: number;

    if (episode) {
      episodeId = episode.id;
    } else {
      const [newEpisode] = await db
        .insert(episodes)
        .values({
          podcastId,
          podcastIndexId: episodeData.podcastIndexId,
          title: episodeData.title,
          description: episodeData.description,
          audioUrl: episodeData.audioUrl,
          duration: episodeData.duration,
          publishDate: episodeData.publishDate,
        })
        .returning({ id: episodes.id });
      episodeId = newEpisode.id;
    }

    // Check if already saved
    const existingEntry = await db.query.userLibrary.findFirst({
      where: and(
        eq(userLibrary.userId, userId),
        eq(userLibrary.episodeId, episodeId)
      ),
    });

    if (existingEntry) {
      return { success: true, message: "Episode already in library" };
    }

    // Add to library
    await db.insert(userLibrary).values({
      userId,
      episodeId,
    });

    revalidatePath("/library");
    revalidatePath(`/episode/${episodeData.podcastIndexId}`);

    return { success: true, message: "Episode saved to library" };
  } catch (error) {
    console.error("Error saving episode to library:", error);
    return { success: false, error: "Failed to save episode. Please try again." };
  }
}

// Remove an episode from the user's library
export async function removeEpisodeFromLibrary(episodePodcastIndexId: string) {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: "You must be signed in to remove episodes" };
  }

  try {
    // Find the episode
    const episode = await db.query.episodes.findFirst({
      where: eq(episodes.podcastIndexId, episodePodcastIndexId),
    });

    if (!episode) {
      return { success: false, error: "Episode not found" };
    }

    // Delete from library
    await db
      .delete(userLibrary)
      .where(
        and(
          eq(userLibrary.userId, userId),
          eq(userLibrary.episodeId, episode.id)
        )
      );

    revalidatePath("/library");
    revalidatePath(`/episode/${episodePodcastIndexId}`);

    return { success: true, message: "Episode removed from library" };
  } catch (error) {
    console.error("Error removing episode from library:", error);
    return { success: false, error: "Failed to remove episode. Please try again." };
  }
}

// Check if an episode is saved to the user's library
export async function isEpisodeSaved(episodePodcastIndexId: string): Promise<boolean> {
  const { userId } = await auth();

  if (!userId) {
    return false;
  }

  try {
    const episode = await db.query.episodes.findFirst({
      where: eq(episodes.podcastIndexId, episodePodcastIndexId),
    });

    if (!episode) {
      return false;
    }

    const libraryEntry = await db.query.userLibrary.findFirst({
      where: and(
        eq(userLibrary.userId, userId),
        eq(userLibrary.episodeId, episode.id)
      ),
    });

    return !!libraryEntry;
  } catch (error) {
    console.error("Error checking library status:", error);
    return false;
  }
}

// Get all saved episodes for the current user
export async function getUserLibrary() {
  const { userId } = await auth();

  if (!userId) {
    return { items: [], error: "You must be signed in to view your library" };
  }

  try {
    const items = await db.query.userLibrary.findMany({
      where: eq(userLibrary.userId, userId),
      with: {
        episode: {
          with: {
            podcast: true,
          },
        },
        collection: true,
      },
      orderBy: [desc(userLibrary.savedAt)],
    });

    return { items, error: null };
  } catch (error) {
    console.error("Error fetching library:", error);
    return { items: [], error: "Failed to load library" };
  }
}

// Update notes for a library entry
export async function updateLibraryNotes(
  episodePodcastIndexId: string,
  notes: string
) {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: "You must be signed in to update notes" };
  }

  try {
    const episode = await db.query.episodes.findFirst({
      where: eq(episodes.podcastIndexId, episodePodcastIndexId),
    });

    if (!episode) {
      return { success: false, error: "Episode not found" };
    }

    const libraryEntry = await db.query.userLibrary.findFirst({
      where: and(
        eq(userLibrary.userId, userId),
        eq(userLibrary.episodeId, episode.id)
      ),
    });

    if (!libraryEntry) {
      return { success: false, error: "Episode not in library" };
    }

    await db
      .update(userLibrary)
      .set({ notes })
      .where(eq(userLibrary.id, libraryEntry.id));

    revalidatePath("/library");

    return { success: true, message: "Notes updated" };
  } catch (error) {
    console.error("Error updating notes:", error);
    return { success: false, error: "Failed to update notes. Please try again." };
  }
}
