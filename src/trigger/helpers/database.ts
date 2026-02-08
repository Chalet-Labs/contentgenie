import { eq } from "drizzle-orm";
import { db } from "@/db";
import { episodes, podcasts } from "@/db/schema";
import type { SummaryResult } from "@/lib/openrouter";
import type { PodcastIndexPodcast, PodcastIndexEpisode } from "@/lib/podcastindex";

export async function persistEpisodeSummary(
  episode: PodcastIndexEpisode,
  podcast: PodcastIndexPodcast | undefined,
  summary: SummaryResult,
  transcript?: string
): Promise<void> {
  // Ensure or create podcast in database
  let dbPodcast = await db.query.podcasts.findFirst({
    where: eq(podcasts.podcastIndexId, episode.feedId.toString()),
  });

  if (!dbPodcast && podcast) {
    const categories = podcast.categories
      ? Object.values(podcast.categories)
      : [];

    const [newPodcast] = await db
      .insert(podcasts)
      .values({
        podcastIndexId: episode.feedId.toString(),
        title: podcast.title,
        description: podcast.description,
        publisher: podcast.author || podcast.ownerName,
        imageUrl: podcast.artwork || podcast.image,
        rssFeedUrl: podcast.url,
        categories,
        totalEpisodes: podcast.episodeCount,
        latestEpisodeDate: podcast.newestItemPubdate
          ? new Date(podcast.newestItemPubdate * 1000)
          : null,
      })
      .returning();
    dbPodcast = newPodcast;
  }

  if (!dbPodcast) {
    throw new Error("Could not find or create podcast in database");
  }

  // Check for existing episode
  const existingEpisode = await db.query.episodes.findFirst({
    where: eq(episodes.podcastIndexId, episode.id.toString()),
  });

  if (existingEpisode) {
    await db
      .update(episodes)
      .set({
        summary: summary.summary,
        keyTakeaways: summary.keyTakeaways,
        worthItScore: summary.worthItScore.toFixed(2),
        transcription: transcript,
        processedAt: new Date(),
        summaryStatus: "completed",
        updatedAt: new Date(),
      })
      .where(eq(episodes.id, existingEpisode.id));
  } else {
    await db.insert(episodes).values({
      podcastId: dbPodcast.id,
      podcastIndexId: episode.id.toString(),
      title: episode.title,
      description: episode.description,
      audioUrl: episode.enclosureUrl,
      duration: episode.duration,
      publishDate: episode.datePublished
        ? new Date(episode.datePublished * 1000)
        : null,
      transcription: transcript,
      summary: summary.summary,
      keyTakeaways: summary.keyTakeaways,
      worthItScore: summary.worthItScore.toFixed(2),
      summaryStatus: "completed",
      processedAt: new Date(),
    });
  }
}
