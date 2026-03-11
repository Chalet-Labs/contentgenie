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
   * - `"full"` (default): updates all provided fields including `source`,
   *   `rssFeedUrl`, and `lastPolledAt`. Use for trusted Trigger.dev call sites.
   * - `"safe"`: updates only whitelisted display fields (`title`, `imageUrl`,
   *   `description`, `publisher`, `categories`, `totalEpisodes`,
   *   `latestEpisodeDate`, `updatedAt`). Protected fields (`source`,
   *   `rssFeedUrl`, `lastPolledAt`) are never overwritten. Use for
   *   client-facing server actions and API routes.
   */
  updateOnConflict?: "full" | "safe";
}

/**
 * Upsert a podcast and return its database ID.
 *
 * Uses INSERT ... ON CONFLICT DO UPDATE targeting `podcasts.podcastIndexId`.
 *
 * Pass `{ updateOnConflict: "safe" }` from client-facing call sites to restrict
 * conflict updates to safe display fields only (`title`, `imageUrl`, `description`,
 * `publisher`, `categories`, `totalEpisodes`, `latestEpisodeDate`, `updatedAt`).
 * Protected fields (`source`, `rssFeedUrl`, `lastPolledAt`) are never touched.
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

  const safeDisplayFields = {
    title,
    imageUrl: data.imageUrl,
    description: data.description,
    publisher: data.publisher,
    categories: data.categories,
    totalEpisodes: data.totalEpisodes,
    latestEpisodeDate: data.latestEpisodeDate,
  };

  if (options?.updateOnConflict === "safe") {
    // Only update whitelisted display fields; protected fields (source,
    // rssFeedUrl, lastPolledAt) are never overwritten from client paths.
    const set = {
      ...Object.fromEntries(
        Object.entries(safeDisplayFields).filter(([, v]) => {
          if (Array.isArray(v)) return v.length > 0;
          return v != null;
        })
      ),
      updatedAt: new Date(),
    };

    // Strip protected fields from INSERT values too — client paths should
    // never seed rssFeedUrl or source, even for brand-new records.
    const { rssFeedUrl: _url, source: _src, ...safeValues } = values;

    const [row] = await db
      .insert(podcasts)
      .values(safeValues)
      .onConflictDoUpdate({
        target: podcasts.podcastIndexId,
        set,
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
