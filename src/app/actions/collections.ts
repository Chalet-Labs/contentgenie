"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eq, and, desc, count, getTableColumns } from "drizzle-orm";
import { db } from "@/db";
import { users, collections, userLibrary } from "@/db/schema";

// Create a new collection
export async function createCollection(name: string, description?: string) {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: "You must be signed in to create collections" };
  }

  if (!name || name.trim().length === 0) {
    return { success: false, error: "Collection name is required" };
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

    const [newCollection] = await db
      .insert(collections)
      .values({
        userId,
        name: name.trim(),
        description: description?.trim() || null,
      })
      .returning();

    revalidatePath("/library");

    return { success: true, collection: newCollection };
  } catch (error) {
    console.error("Error creating collection:", error);
    return { success: false, error: "Failed to create collection. Please try again." };
  }
}

// Update an existing collection
export async function updateCollection(
  collectionId: number,
  name: string,
  description?: string
) {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: "You must be signed in to update collections" };
  }

  if (!name || name.trim().length === 0) {
    return { success: false, error: "Collection name is required" };
  }

  try {
    // Verify ownership
    const collection = await db.query.collections.findFirst({
      where: and(
        eq(collections.id, collectionId),
        eq(collections.userId, userId)
      ),
    });

    if (!collection) {
      return { success: false, error: "Collection not found" };
    }

    const [updatedCollection] = await db
      .update(collections)
      .set({
        name: name.trim(),
        description: description?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(collections.id, collectionId))
      .returning();

    revalidatePath("/library");
    revalidatePath(`/library/collection/${collectionId}`);

    return { success: true, collection: updatedCollection };
  } catch (error) {
    console.error("Error updating collection:", error);
    return { success: false, error: "Failed to update collection. Please try again." };
  }
}

// Delete a collection
export async function deleteCollection(collectionId: number) {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: "You must be signed in to delete collections" };
  }

  try {
    // Verify ownership
    const collection = await db.query.collections.findFirst({
      where: and(
        eq(collections.id, collectionId),
        eq(collections.userId, userId)
      ),
    });

    if (!collection) {
      return { success: false, error: "Collection not found" };
    }

    // Remove collection from all library entries (sets to null due to schema)
    await db
      .update(userLibrary)
      .set({ collectionId: null })
      .where(eq(userLibrary.collectionId, collectionId));

    // Delete the collection
    await db.delete(collections).where(eq(collections.id, collectionId));

    revalidatePath("/library");

    return { success: true, message: "Collection deleted" };
  } catch (error) {
    console.error("Error deleting collection:", error);
    return { success: false, error: "Failed to delete collection. Please try again." };
  }
}

// Get all collections for the current user
export async function getUserCollections() {
  const { userId } = await auth();

  if (!userId) {
    return { collections: [], error: "You must be signed in to view collections" };
  }

  try {
    // Optimized query to fetch all collections and their episode counts in a single query
    // This eliminates the N+1 problem where we previously performed a separate query for each collection.
    const collectionsWithCounts = await db
      .select({
        ...getTableColumns(collections),
        episodeCount: count(userLibrary.id).mapWith(Number),
      })
      .from(collections)
      .leftJoin(
        userLibrary,
        and(
          eq(collections.id, userLibrary.collectionId),
          eq(userLibrary.userId, userId)
        )
      )
      .where(eq(collections.userId, userId))
      .groupBy(collections.id)
      .orderBy(desc(collections.createdAt));

    return { collections: collectionsWithCounts, error: null };
  } catch (error) {
    console.error("Error fetching collections:", error);
    return { collections: [], error: "Failed to load collections" };
  }
}

// Get a single collection with its episodes
export async function getCollection(collectionId: number) {
  const { userId } = await auth();

  if (!userId) {
    return { collection: null, items: [], error: "You must be signed in to view collections" };
  }

  try {
    const collection = await db.query.collections.findFirst({
      where: and(
        eq(collections.id, collectionId),
        eq(collections.userId, userId)
      ),
    });

    if (!collection) {
      return { collection: null, items: [], error: "Collection not found" };
    }

    // BOLT OPTIMIZATION: Use selective column fetching to avoid loading high-volume text fields
    // (transcription, summary, keyTakeaways) that are not needed for list views.
    // Expected impact: Faster load times and lower memory footprint for collection views.
    const items = await db.query.userLibrary.findMany({
      where: and(
        eq(userLibrary.userId, userId),
        eq(userLibrary.collectionId, collectionId)
      ),
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
      },
      orderBy: [desc(userLibrary.savedAt)],
    });

    return { collection, items, error: null };
  } catch (error) {
    console.error("Error fetching collection:", error);
    return { collection: null, items: [], error: "Failed to load collection" };
  }
}

// Move an episode to a collection (or remove from collection if collectionId is null)
export async function moveEpisodeToCollection(
  libraryEntryId: number,
  collectionId: number | null
) {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: "You must be signed in to organize episodes" };
  }

  try {
    // Verify library entry ownership
    const libraryEntry = await db.query.userLibrary.findFirst({
      where: and(
        eq(userLibrary.id, libraryEntryId),
        eq(userLibrary.userId, userId)
      ),
    });

    if (!libraryEntry) {
      return { success: false, error: "Library entry not found" };
    }

    // If moving to a collection, verify collection ownership
    if (collectionId !== null) {
      const collection = await db.query.collections.findFirst({
        where: and(
          eq(collections.id, collectionId),
          eq(collections.userId, userId)
        ),
      });

      if (!collection) {
        return { success: false, error: "Collection not found" };
      }
    }

    // Update the library entry
    await db
      .update(userLibrary)
      .set({ collectionId })
      .where(eq(userLibrary.id, libraryEntryId));

    revalidatePath("/library");
    if (collectionId !== null) {
      revalidatePath(`/library/collection/${collectionId}`);
    }

    return { success: true, message: collectionId ? "Episode moved to collection" : "Episode removed from collection" };
  } catch (error) {
    console.error("Error moving episode to collection:", error);
    return { success: false, error: "Failed to move episode. Please try again." };
  }
}
