import { db } from "@/db";
import { podcasts } from "@/db/schema";

export interface UpsertPodcastData {
  podcastIndexId: string;
  title: string;
  description?: string;
  publisher?: string;
  imageUrl?: string;
  rssFeedUrl?: string;
  categories?: string[];
  totalEpisodes?: number;
  latestEpisodeDate?: Date | null;
  source?: "podcastindex" | "rss";
}

/**
 * Upsert a podcast and return its database ID.
 *
 * Uses INSERT ... ON CONFLICT DO UPDATE targeting `podcasts.podcastIndexId`.
 * Optional fields that are `undefined` are ignored by Drizzle (not overwritten).
 */
export async function upsertPodcast(data: UpsertPodcastData): Promise<number> {
  const [result] = await db
    .insert(podcasts)
    .values({
      podcastIndexId: data.podcastIndexId,
      title: data.title,
      description: data.description,
      publisher: data.publisher,
      imageUrl: data.imageUrl,
      rssFeedUrl: data.rssFeedUrl,
      categories: data.categories,
      totalEpisodes: data.totalEpisodes,
      latestEpisodeDate: data.latestEpisodeDate,
      source: data.source,
    })
    .onConflictDoUpdate({
      target: podcasts.podcastIndexId,
      set: {
        title: data.title,
        description: data.description,
        publisher: data.publisher,
        imageUrl: data.imageUrl,
        rssFeedUrl: data.rssFeedUrl,
        categories: data.categories,
        totalEpisodes: data.totalEpisodes,
        latestEpisodeDate: data.latestEpisodeDate,
        source: data.source,
        updatedAt: new Date(),
      },
    })
    .returning({ id: podcasts.id });

  if (!result) {
    throw new Error(`Failed to upsert podcast: ${data.podcastIndexId}`);
  }

  return result.id;
}
