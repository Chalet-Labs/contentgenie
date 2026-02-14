"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, and, desc, asc, isNotNull, avg, count } from "drizzle-orm";
import { db } from "@/db";
import { users, podcasts, episodes, userLibrary, bookmarks } from "@/db/schema";

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
      columns: { id: true },
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
      columns: { id: true },
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
    // BOLT OPTIMIZATION: Selective column fetching to avoid loading large text fields.
    const episode = await db.query.episodes.findFirst({
      where: eq(episodes.podcastIndexId, episodePodcastIndexId),
      columns: { id: true },
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
    // BOLT OPTIMIZATION: Use a single JOIN query to check existence in the library.
    // This replaces two separate queries and avoids fetching high-volume episode data.
    // Expected impact: ~50% reduction in query latency and significant reduction in DB data transfer.
    const [libraryEntry] = await db
      .select({ id: userLibrary.id })
      .from(userLibrary)
      .innerJoin(episodes, eq(userLibrary.episodeId, episodes.id))
      .where(
        and(
          eq(userLibrary.userId, userId),
          eq(episodes.podcastIndexId, episodePodcastIndexId)
        )
      )
      .limit(1);

    return !!libraryEntry;
  } catch (error) {
    console.error("Error checking library status:", error);
    return false;
  }
}

export type LibrarySortOption = "savedAt" | "rating" | "publishDate" | "title";
export type SortDirection = "asc" | "desc";

// Get all saved episodes for the current user
export async function getUserLibrary(
  sortBy: LibrarySortOption = "savedAt",
  sortDirection: SortDirection = "desc"
) {
  const { userId } = await auth();

  if (!userId) {
    return { items: [], error: "You must be signed in to view your library" };
  }

  try {
    // BOLT OPTIMIZATION: Use selective column fetching to avoid loading high-volume text fields
    // (transcription, summary, keyTakeaways) that are not needed for list views.
    // Expected impact: Significant reduction in memory usage and network latency for large libraries.
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
            duration: true,
            publishDate: true,
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
        collection: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [desc(userLibrary.savedAt)], // Default order from DB
    });

    // Sort in JavaScript to handle episode properties and null ratings
    const sortedItems = [...items].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "rating":
          // Items with ratings come first, then sort by rating value
          const ratingA = a.rating ?? -1;
          const ratingB = b.rating ?? -1;
          comparison = ratingB - ratingA; // Default high to low
          break;
        case "publishDate":
          const dateA = a.episode.publishDate?.getTime() ?? 0;
          const dateB = b.episode.publishDate?.getTime() ?? 0;
          comparison = dateB - dateA; // Default newest first
          break;
        case "title":
          comparison = a.episode.title.localeCompare(b.episode.title);
          break;
        case "savedAt":
        default:
          const savedA = a.savedAt.getTime();
          const savedB = b.savedAt.getTime();
          comparison = savedB - savedA; // Default newest first
          break;
      }

      return sortDirection === "asc" ? -comparison : comparison;
    });

    return { items: sortedItems, error: null };
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
    // BOLT OPTIMIZATION: Selective column fetching to avoid loading large text fields.
    const episode = await db.query.episodes.findFirst({
      where: eq(episodes.podcastIndexId, episodePodcastIndexId),
      columns: { id: true },
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

// Add a bookmark to a library entry
export async function addBookmark(
  libraryEntryId: number,
  timestamp: number,
  note?: string
) {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: "You must be signed in to add bookmarks" };
  }

  try {
    // Verify the library entry belongs to the user
    const libraryEntry = await db.query.userLibrary.findFirst({
      where: and(
        eq(userLibrary.id, libraryEntryId),
        eq(userLibrary.userId, userId)
      ),
    });

    if (!libraryEntry) {
      return { success: false, error: "Library entry not found" };
    }

    const [bookmark] = await db
      .insert(bookmarks)
      .values({
        userLibraryId: libraryEntryId,
        timestamp,
        note: note || null,
      })
      .returning();

    revalidatePath("/library");

    return { success: true, bookmark };
  } catch (error) {
    console.error("Error adding bookmark:", error);
    return { success: false, error: "Failed to add bookmark. Please try again." };
  }
}

// Update a bookmark's note
export async function updateBookmark(bookmarkId: number, note: string) {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: "You must be signed in to update bookmarks" };
  }

  try {
    // Verify the bookmark belongs to the user
    const bookmark = await db.query.bookmarks.findFirst({
      where: eq(bookmarks.id, bookmarkId),
      with: {
        libraryEntry: true,
      },
    });

    if (!bookmark || bookmark.libraryEntry.userId !== userId) {
      return { success: false, error: "Bookmark not found" };
    }

    await db
      .update(bookmarks)
      .set({ note })
      .where(eq(bookmarks.id, bookmarkId));

    revalidatePath("/library");

    return { success: true, message: "Bookmark updated" };
  } catch (error) {
    console.error("Error updating bookmark:", error);
    return { success: false, error: "Failed to update bookmark. Please try again." };
  }
}

// Delete a bookmark
export async function deleteBookmark(bookmarkId: number) {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: "You must be signed in to delete bookmarks" };
  }

  try {
    // Verify the bookmark belongs to the user
    const bookmark = await db.query.bookmarks.findFirst({
      where: eq(bookmarks.id, bookmarkId),
      with: {
        libraryEntry: true,
      },
    });

    if (!bookmark || bookmark.libraryEntry.userId !== userId) {
      return { success: false, error: "Bookmark not found" };
    }

    await db.delete(bookmarks).where(eq(bookmarks.id, bookmarkId));

    revalidatePath("/library");

    return { success: true, message: "Bookmark deleted" };
  } catch (error) {
    console.error("Error deleting bookmark:", error);
    return { success: false, error: "Failed to delete bookmark. Please try again." };
  }
}

// Update rating for a library entry
export async function updateLibraryRating(
  episodePodcastIndexId: string,
  rating: number
) {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: "You must be signed in to rate episodes" };
  }

  if (rating < 1 || rating > 5) {
    return { success: false, error: "Rating must be between 1 and 5" };
  }

  try {
    // BOLT OPTIMIZATION: Selective column fetching to avoid loading large text fields.
    const episode = await db.query.episodes.findFirst({
      where: eq(episodes.podcastIndexId, episodePodcastIndexId),
      columns: { id: true },
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
      .set({ rating })
      .where(eq(userLibrary.id, libraryEntry.id));

    revalidatePath("/library");

    return { success: true, message: "Rating updated" };
  } catch (error) {
    console.error("Error updating rating:", error);
    return { success: false, error: "Failed to update rating. Please try again." };
  }
}

// Get average rating for an episode across all users
export async function getEpisodeAverageRating(episodePodcastIndexId: string) {
  try {
    const [result] = await db
      .select({
        averageRating: avg(userLibrary.rating),
        ratingCount: count(userLibrary.rating),
      })
      .from(userLibrary)
      .innerJoin(episodes, eq(userLibrary.episodeId, episodes.id))
      .where(
        and(
          eq(episodes.podcastIndexId, episodePodcastIndexId),
          isNotNull(userLibrary.rating)
        )
      );

    const ratingCount = Number(result?.ratingCount || 0);
    const averageRating = result?.averageRating
      ? Math.round(Number(result.averageRating) * 10) / 10
      : null;

    return {
      averageRating,
      ratingCount,
      error: null,
    };
  } catch (error) {
    console.error("Error fetching average rating:", error);
    return { averageRating: null, ratingCount: 0, error: "Failed to load ratings" };
  }
}

// Get bookmarks for a library entry
export async function getBookmarks(libraryEntryId: number) {
  const { userId } = await auth();

  if (!userId) {
    return { bookmarks: [], error: "You must be signed in to view bookmarks" };
  }

  try {
    // Verify the library entry belongs to the user
    const libraryEntry = await db.query.userLibrary.findFirst({
      where: and(
        eq(userLibrary.id, libraryEntryId),
        eq(userLibrary.userId, userId)
      ),
    });

    if (!libraryEntry) {
      return { bookmarks: [], error: "Library entry not found" };
    }

    const result = await db.query.bookmarks.findMany({
      where: eq(bookmarks.userLibraryId, libraryEntryId),
      orderBy: [asc(bookmarks.timestamp)],
    });

    return { bookmarks: result, error: null };
  } catch (error) {
    console.error("Error fetching bookmarks:", error);
    return { bookmarks: [], error: "Failed to load bookmarks" };
  }
}
