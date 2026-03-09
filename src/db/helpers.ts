import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, podcasts } from "@/db/schema";
import { getClerkEmail } from "@/lib/clerk-helpers";

/**
 * Ensure a user row exists, backfilling the email from Clerk on conflict.
 * Safe to call on every mutation — uses INSERT ON CONFLICT.
 */
export async function ensureUserExists(userId: string): Promise<void> {
  // Fast path: skip Clerk lookup if user already exists with a non-empty email
  const existing = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { email: true },
  });
  if (existing?.email) return;

  const email = await getClerkEmail(userId);
  if (email) {
    await db
      .insert(users)
      .values({ id: userId, email, name: null })
      .onConflictDoUpdate({ target: users.id, set: { email } });
  } else {
    await db
      .insert(users)
      .values({ id: userId, email, name: null })
      .onConflictDoNothing();
  }
}

export interface UpsertPodcastData {
  podcastIndexId: string;
  title: string;
  description?: string;
  publisher?: string;
  imageUrl?: string;
  rssFeedUrl?: string;
  categories?: string[];
  totalEpisodes?: number;
  latestEpisodeDate?: Date;
  source?: "podcastindex" | "rss";
}

interface UpsertPodcastOptions {
  /**
   * When false, uses INSERT ... ON CONFLICT DO NOTHING instead of updating.
   * Use for untrusted call sites where client-provided data should not
   * overwrite existing podcast metadata. Defaults to true.
   */
  updateOnConflict?: boolean;
}

/**
 * Upsert a podcast and return its database ID.
 *
 * Uses INSERT ... ON CONFLICT DO UPDATE targeting `podcasts.podcastIndexId`.
 * Only defined fields are included in the conflict update — `undefined` values
 * are explicitly filtered out rather than relying on Drizzle's internal handling.
 *
 * Pass `{ updateOnConflict: false }` from untrusted call sites (e.g. client-facing
 * server actions) to prevent metadata overwrites via INSERT ... ON CONFLICT DO NOTHING.
 */
export async function upsertPodcast(
  data: UpsertPodcastData,
  options?: UpsertPodcastOptions
): Promise<number> {
  const podcastIndexId = data.podcastIndexId.trim();
  const title = data.title.trim();

  if (!podcastIndexId || !title) {
    throw new Error("podcastIndexId and title are required");
  }

  const values = {
    podcastIndexId,
    title,
    description: data.description,
    publisher: data.publisher,
    imageUrl: data.imageUrl,
    rssFeedUrl: data.rssFeedUrl,
    categories: data.categories,
    totalEpisodes: data.totalEpisodes,
    latestEpisodeDate: data.latestEpisodeDate,
    source: data.source,
  };

  if (options?.updateOnConflict === false) {
    // No-op touch so RETURNING works on conflicts (avoids a second SELECT)
    const [row] = await db
      .insert(podcasts)
      .values(values)
      .onConflictDoUpdate({
        target: podcasts.podcastIndexId,
        set: { podcastIndexId: podcasts.podcastIndexId },
      })
      .returning({ id: podcasts.id });

    if (!row) {
      throw new Error(`Failed to upsert podcast: ${podcastIndexId}`);
    }

    return row.id;
  }

  // Build set with only defined values — explicit filtering instead of
  // relying on Drizzle's internal undefined-skipping behavior.
  const updateFields = {
    title,
    description: data.description,
    publisher: data.publisher,
    imageUrl: data.imageUrl,
    rssFeedUrl: data.rssFeedUrl,
    categories: data.categories,
    totalEpisodes: data.totalEpisodes,
    latestEpisodeDate: data.latestEpisodeDate,
    source: data.source,
  };

  const set = {
    ...Object.fromEntries(
      Object.entries(updateFields).filter(([, v]) => v != null)
    ),
    updatedAt: new Date(),
  };

  const [result] = await db
    .insert(podcasts)
    .values(values)
    .onConflictDoUpdate({
      target: podcasts.podcastIndexId,
      set,
    })
    .returning({ id: podcasts.id });

  if (!result) {
    throw new Error(`Failed to upsert podcast: ${podcastIndexId}`);
  }

  return result.id;
}
