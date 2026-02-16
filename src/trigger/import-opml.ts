import { task, retry, logger, metadata } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  podcasts,
  episodes,
  userSubscriptions,
} from "@/db/schema";
import { getPodcastByFeedUrl } from "./helpers/podcastindex";
import {
  parsePodcastFeed,
  generatePodcastSyntheticId,
  generateEpisodeSyntheticId,
} from "@/lib/rss";
import type { OpmlFeed } from "@/lib/opml";

const MAX_EPISODES_PER_FEED = 50;

export type ImportOpmlPayload = {
  userId: string;
  feeds: OpmlFeed[];
  alreadySubscribedCount: number;
};

export type ImportOpmlProgress = {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  completed: number;
};

export type ImportOpmlResult = {
  succeeded: number;
  failed: number;
  skipped: number;
};

export const importOpml = task({
  id: "import-opml",
  retry: { maxAttempts: 2 },
  queue: { name: "import-queue", concurrencyLimit: 2 },
  maxDuration: 300,
  onFailure: async (params: { payload: ImportOpmlPayload }) => {
    logger.error("OPML import task failed permanently", {
      userId: params.payload.userId,
      feedCount: params.payload.feeds.length,
    });
  },
  run: async (payload: ImportOpmlPayload): Promise<ImportOpmlResult> => {
    const { userId, feeds, alreadySubscribedCount } = payload;
    const total = feeds.length + alreadySubscribedCount;

    logger.info("Starting OPML import", {
      userId,
      feedCount: feeds.length,
      alreadySubscribed: alreadySubscribedCount,
    });

    // Ensure user exists
    await db
      .insert(users)
      .values({ id: userId, email: "" })
      .onConflictDoNothing();

    let succeeded = 0;
    let failed = 0;

    // Set initial progress
    metadata.set("progress", {
      total,
      succeeded: 0,
      failed: 0,
      skipped: alreadySubscribedCount,
      completed: alreadySubscribedCount,
    } satisfies ImportOpmlProgress);

    // Sequential iteration with per-feed error isolation
    for (const feed of feeds) {
      try {
        await importSingleFeed(userId, feed);
        succeeded++;
      } catch (error) {
        failed++;
        logger.error("Failed to import feed", {
          feedUrl: feed.feedUrl,
          title: feed.title,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Update progress after each feed
      metadata.set("progress", {
        total,
        succeeded,
        failed,
        skipped: alreadySubscribedCount,
        completed: succeeded + failed + alreadySubscribedCount,
      } satisfies ImportOpmlProgress);

      // Rate limiting delay between feeds
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    logger.info("OPML import complete", {
      succeeded,
      failed,
      skipped: alreadySubscribedCount,
    });

    return { succeeded, failed, skipped: alreadySubscribedCount };
  },
});

/**
 * Import a single feed: look up on PodcastIndex first, fall back to RSS parsing.
 * Creates podcast + subscription (and episodes for RSS fallback).
 */
async function importSingleFeed(userId: string, feed: OpmlFeed): Promise<void> {
  const { feedUrl } = feed;

  // Step 1: Try PodcastIndex lookup by feed URL
  try {
    const response = await retry.onThrow(
      async () => getPodcastByFeedUrl(feedUrl),
      { maxAttempts: 2 }
    );

    if (response?.feed) {
      const piFeed = response.feed;
      logger.info("Found podcast on PodcastIndex", {
        feedUrl,
        podcastIndexId: piFeed.id,
        title: piFeed.title,
      });

      // Upsert podcast with PodcastIndex data
      const podcastId = await upsertPodcast({
        podcastIndexId: String(piFeed.id),
        title: piFeed.title,
        description: piFeed.description,
        publisher: piFeed.author,
        imageUrl: piFeed.artwork || piFeed.image,
        rssFeedUrl: piFeed.url || piFeed.originalUrl || feedUrl,
        categories: piFeed.categories
          ? Object.values(piFeed.categories)
          : undefined,
        totalEpisodes: piFeed.episodeCount,
        source: "podcastindex",
      });

      // Create subscription
      await db
        .insert(userSubscriptions)
        .values({ userId, podcastId })
        .onConflictDoNothing();

      return;
    }
  } catch (error) {
    logger.info("PodcastIndex lookup failed, falling back to RSS", {
      feedUrl,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Step 2: RSS fallback — parse feed directly
  logger.info("Parsing RSS feed directly", { feedUrl });

  const parsedFeed = await retry.onThrow(
    async () => parsePodcastFeed(feedUrl),
    { maxAttempts: 2 }
  );

  const syntheticPodcastId = generatePodcastSyntheticId(feedUrl);

  const podcastId = await upsertPodcast({
    podcastIndexId: syntheticPodcastId,
    title: parsedFeed.title,
    description: parsedFeed.description ?? undefined,
    publisher: parsedFeed.author ?? undefined,
    imageUrl: parsedFeed.imageUrl ?? undefined,
    rssFeedUrl: feedUrl,
    source: "rss",
  });

  // Insert episodes (max 50, newest first)
  const sortedEpisodes = [...parsedFeed.episodes].sort((a, b) => {
    const dateA = a.publishDate?.getTime() ?? 0;
    const dateB = b.publishDate?.getTime() ?? 0;
    return dateB - dateA;
  });
  const episodesToInsert = sortedEpisodes.slice(0, MAX_EPISODES_PER_FEED);

  if (episodesToInsert.length > 0) {
    const episodeValues = episodesToInsert.map((ep) => ({
      podcastId,
      podcastIndexId: generateEpisodeSyntheticId(feedUrl, ep.guid),
      title: ep.title,
      description: ep.description,
      audioUrl: ep.audioUrl,
      duration: ep.duration,
      publishDate: ep.publishDate,
      rssGuid: ep.guid,
    }));

    await db
      .insert(episodes)
      .values(episodeValues)
      .onConflictDoNothing();
  }

  // Create subscription
  await db
    .insert(userSubscriptions)
    .values({ userId, podcastId })
    .onConflictDoNothing();

  logger.info("Imported feed via RSS", {
    feedUrl,
    title: parsedFeed.title,
    episodesImported: episodesToInsert.length,
  });
}

/**
 * Upsert a podcast and return its database ID.
 */
async function upsertPodcast(data: {
  podcastIndexId: string;
  title: string;
  description?: string;
  publisher?: string;
  imageUrl?: string;
  rssFeedUrl?: string;
  categories?: string[];
  totalEpisodes?: number;
  source: "podcastindex" | "rss";
}): Promise<number> {
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
        updatedAt: new Date(),
      },
    })
    .returning({ id: podcasts.id });

  if (!result) {
    throw new Error(`Failed to upsert podcast: ${data.podcastIndexId}`);
  }

  return result.id;
}
