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
   * Controls conflict-update behaviour:
   * - `"full"` (default): updates all provided fields including `source` and
   *   `rssFeedUrl`. Use for trusted Trigger.dev call sites.
   * - `"safe"`: no metadata updates on conflict — only bumps `updatedAt` so
   *   RETURNING works. Protected fields (`source`, `rssFeedUrl`) are also
   *   stripped from the INSERT values. Use for client-facing server actions
   *   and API routes where metadata is owned by background jobs.
   */
  updateOnConflict?: "full" | "safe";
}

/**
 * Upsert a podcast and return its database ID.
 *
 * Uses INSERT ... ON CONFLICT DO UPDATE targeting `podcasts.podcastIndexId`.
 *
 * Pass `{ updateOnConflict: "safe" }` from client-facing call sites. No metadata
 * is updated on conflict — the row is only touched so RETURNING yields the ID.
 * Protected fields (`source`, `rssFeedUrl`) are stripped from INSERT values too.
 *
 * Pass `{ updateOnConflict: "full" }` (or omit the option) from trusted Trigger.dev
 * call sites to update all provided fields.
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

  if (options?.updateOnConflict === "safe") {
    // Client paths: no metadata updates on conflict. Only bump updatedAt so
    // the ON CONFLICT DO UPDATE clause fires and RETURNING yields the row ID.
    // Protected fields (rssFeedUrl, source) are stripped from INSERT too.
    const { rssFeedUrl: _url, source: _src, ...safeValues } = values;

    const [row] = await db
      .insert(podcasts)
      .values(safeValues)
      .onConflictDoUpdate({
        target: podcasts.podcastIndexId,
        set: { updatedAt: new Date() },
      })
      .returning({ id: podcasts.id });

    if (!row) {
      throw new Error(`Failed to upsert podcast: ${podcastIndexId}`);
    }

    return row.id;
  }

  // "full" mode (default): build set with only defined values — explicit
  // filtering instead of relying on Drizzle's internal undefined-skipping.
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
