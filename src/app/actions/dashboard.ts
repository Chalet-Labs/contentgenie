"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  eq,
  desc,
  and,
  gte,
  isNotNull,
  notInArray,
  inArray,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  userSubscriptions,
  userLibrary,
  listenHistory,
  episodes,
  podcasts,
  trendingTopics,
  episodeTopics,
  type TrendingTopic,
} from "@/db/schema";
import { type RecommendedEpisodeDTO } from "@/db/library-columns";
import { getTopicSlug } from "@/lib/trending";
import {
  getEpisodesByFeedId,
  type PodcastIndexEpisode,
} from "@/lib/podcastindex";
import {
  buildUserTopicProfile,
  computeTopicOverlap,
  EMPTY_OVERLAP_RESULT,
  HIGH_OVERLAP_THRESHOLD,
} from "@/lib/topic-overlap";

// Maximum episodes to include per podcast for variety in the dashboard feed
const MAX_EPISODES_PER_PODCAST = 3;

/** Fetch consumed episode IDs and build the user's topic profile in 2 batch queries. */
async function fetchUserTopicProfile(userId: string) {
  const consumedRows = await db
    .select({ episodeId: listenHistory.episodeId })
    .from(listenHistory)
    .where(eq(listenHistory.userId, userId))
    .union(
      db
        .select({ episodeId: userLibrary.episodeId })
        .from(userLibrary)
        .where(eq(userLibrary.userId, userId)),
    );

  const totalConsumed = consumedRows.length;
  const consumedIds = consumedRows.map((r) => r.episodeId);

  let topicCountRows: Array<{ topic: string; count: number }> = [];
  if (consumedIds.length > 0) {
    topicCountRows = await db
      .select({
        topic: episodeTopics.topic,
        count: sql<number>`COUNT(DISTINCT ${episodeTopics.episodeId})::integer`,
      })
      .from(episodeTopics)
      .where(inArray(episodeTopics.episodeId, consumedIds))
      .groupBy(episodeTopics.topic);
  }

  return { profile: buildUserTopicProfile(topicCountRows), totalConsumed };
}

// Lightweight check for first-run detection — avoids loading full subscription data
export async function hasAnySubscriptions(): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;

  const row = await db.query.userSubscriptions.findFirst({
    where: eq(userSubscriptions.userId, userId),
    columns: { id: true },
  });

  return row !== undefined;
}

// Fetch more episodes than needed (5x) to account for the per-podcast variety cap.
// In skewed cases (one very active podcast dominates), we may still return fewer than `limit` items.
const BATCH_FETCH_MULTIPLIER = 5;

// Get recent episodes from subscribed podcasts
export async function getRecentEpisodesFromSubscriptions({
  limit = 10,
  since,
}: { limit?: number; since?: number } = {}) {
  const safeLimit =
    Number.isInteger(limit) && limit > 0 ? Math.min(limit, 25) : 10;
  const safeSince =
    typeof since === "number" && Number.isFinite(since) && since >= 0
      ? Math.floor(since)
      : undefined;

  const { userId } = await auth();

  if (!userId) {
    return {
      episodes: [],
      hasSubscriptions: false,
      error: "You must be signed in to view episodes",
    };
  }

  let hasSubscriptions = false;

  try {
    // Get user's subscriptions with podcast data
    // BOLT OPTIMIZATION: Use selective column fetching to avoid loading large text fields
    // (like description) which are not needed for fetching recent episodes.
    const subscriptions = await db.query.userSubscriptions.findMany({
      where: eq(userSubscriptions.userId, userId),
      with: {
        podcast: {
          columns: {
            description: false,
          },
        },
      },
      limit: 100, // Check up to 100 subscriptions (now efficient due to batching)
    });

    hasSubscriptions = subscriptions.length > 0;

    if (!hasSubscriptions) {
      return { episodes: [], hasSubscriptions: false, error: null };
    }

    // BOLT OPTIMIZATION: Batch API calls to PodcastIndex to avoid N+1 problem.
    // Instead of making one request per subscription, we make one request for all.
    // Expected impact: Reduces latency by up to ~90% for users with 10 subscriptions.
    const podcastMap = new Map(
      subscriptions.map((sub) => [sub.podcast.podcastIndexId, sub.podcast]),
    );

    const numericFeedIds = subscriptions
      .map((sub) => sub.podcast.podcastIndexId)
      .filter((id) => /^\d+$/.test(id));

    if (numericFeedIds.length === 0) {
      return { episodes: [], hasSubscriptions: true, error: null };
    }

    // Fetch episodes from all podcasts in one batch (pass `since` to the API for server-side filtering)
    const batchResponse = await getEpisodesByFeedId(
      numericFeedIds.join(","),
      safeLimit * BATCH_FETCH_MULTIPLIER,
      safeSince,
    );
    const rawEpisodes = batchResponse.items || [];

    // Apply time filter if `since` is provided (Unix seconds)
    const batchEpisodes =
      safeSince !== undefined
        ? rawEpisodes.filter((ep) => (ep.datePublished || 0) >= safeSince)
        : rawEpisodes;

    // Map back to our RecentEpisode type and group by feed to maintain variety (max 3 per podcast)
    const episodesByFeed = new Map<
      string,
      Omit<RecentEpisode, "worthItScore">[]
    >();

    for (const ep of batchEpisodes) {
      const pIndexId = String(ep.feedId);
      const podcast = podcastMap.get(pIndexId);
      if (!podcast) {
        console.debug(
          `Episode ${ep.id} has feedId ${pIndexId} not in subscribed podcasts`,
        );
        continue;
      }

      const feedEpisodes = episodesByFeed.get(pIndexId) || [];
      if (feedEpisodes.length < MAX_EPISODES_PER_PODCAST) {
        feedEpisodes.push({
          ...ep,
          podcastTitle: podcast.title,
          podcastImage: podcast.imageUrl,
          podcastId: podcast.podcastIndexId,
        });
        episodesByFeed.set(pIndexId, feedEpisodes);
      }
    }

    const allEpisodes = Array.from(episodesByFeed.values()).flat();

    // Batch-query DB for worth-it scores (keyed by podcastIndexId = String(ep.id))
    const podcastIndexIds = allEpisodes.map((ep) => String(ep.id));
    const scoreRows =
      podcastIndexIds.length > 0
        ? await db
            .select({
              podcastIndexId: episodes.podcastIndexId,
              worthItScore: episodes.worthItScore,
            })
            .from(episodes)
            .where(inArray(episodes.podcastIndexId, podcastIndexIds))
        : [];

    const scoreMap = new Map<string, number | null>();
    for (const row of scoreRows) {
      const parsed =
        row.worthItScore !== null ? parseFloat(row.worthItScore) : null;
      scoreMap.set(
        row.podcastIndexId,
        parsed !== null && Number.isFinite(parsed) ? parsed : null,
      );
    }

    // Merge scores onto episodes
    const enrichedEpisodes: RecentEpisode[] = allEpisodes.map((ep) => ({
      ...ep,
      worthItScore: scoreMap.get(String(ep.id)) ?? null,
    }));

    // Sort: scored episodes by score DESC, then unscored by datePublished DESC
    const scored = enrichedEpisodes
      .filter((ep) => ep.worthItScore !== null)
      .sort((a, b) => (b.worthItScore as number) - (a.worthItScore as number));
    const unscored = enrichedEpisodes
      .filter((ep) => ep.worthItScore === null)
      .sort((a, b) => (b.datePublished || 0) - (a.datePublished || 0));

    const sortedEpisodes = [...scored, ...unscored].slice(0, safeLimit);

    return { episodes: sortedEpisodes, hasSubscriptions: true, error: null };
  } catch (error) {
    console.error("Error fetching recent episodes:", error);
    return {
      episodes: [],
      hasSubscriptions,
      error: "Failed to load recent episodes",
    };
  }
}

const SCORE_THRESHOLD = "6.00";

// Get cross-user episode recommendations ranked by worth-it score,
// excluding episodes from subscribed podcasts, saved episodes, and listened episodes.
export async function getRecommendedEpisodes(
  limit: number = 10,
): Promise<{ episodes: RecommendedEpisodeDTO[]; error: string | null }> {
  const { userId } = await auth();

  if (!userId) {
    return { episodes: [], error: "You must be signed in" };
  }

  try {
    const subscribedPodcastIds = db
      .select({ id: userSubscriptions.podcastId })
      .from(userSubscriptions)
      .where(eq(userSubscriptions.userId, userId));

    const savedEpisodeIds = db
      .select({ id: userLibrary.episodeId })
      .from(userLibrary)
      .where(eq(userLibrary.userId, userId));

    const listenedEpisodeIds = db
      .select({ id: listenHistory.episodeId })
      .from(listenHistory)
      .where(eq(listenHistory.userId, userId));

    const results = await db
      .select({
        id: episodes.id,
        podcastIndexId: episodes.podcastIndexId,
        title: episodes.title,
        description: episodes.description,
        audioUrl: episodes.audioUrl,
        duration: episodes.duration,
        publishDate: episodes.publishDate,
        worthItScore: episodes.worthItScore,
        podcastTitle: podcasts.title,
        podcastImageUrl: podcasts.imageUrl,
      })
      .from(episodes)
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(
        and(
          isNotNull(episodes.worthItScore),
          gte(episodes.worthItScore, SCORE_THRESHOLD),
          notInArray(episodes.podcastId, subscribedPodcastIds),
          notInArray(episodes.id, savedEpisodeIds),
          notInArray(episodes.id, listenedEpisodeIds),
        ),
      )
      // isNotNull above filters null scores, but NULLS LAST is used for consistency
      // with the rest of the codebase and to stay correct if the filter is ever dropped.
      .orderBy(
        sql`${episodes.worthItScore} DESC NULLS LAST`,
        desc(episodes.publishDate),
      )
      .limit(limit);

    // Separate query to avoid aggregation expanding the outer LIMIT result set
    const episodeIds = results.map((r) => r.id);
    let topicRankRows: Array<{
      episodeId: number;
      bestRank: number;
      topTopic: string;
    }> = [];
    if (episodeIds.length > 0) {
      try {
        topicRankRows = await db
          .select({
            episodeId: episodeTopics.episodeId,
            bestRank: sql<number>`MIN(${episodeTopics.topicRank})::integer`,
            topTopic: sql<string>`(array_agg(${episodeTopics.topic} ORDER BY ${episodeTopics.topicRank}))[1]`,
          })
          .from(episodeTopics)
          .where(
            and(
              inArray(episodeTopics.episodeId, episodeIds),
              isNotNull(episodeTopics.topicRank),
              gte(
                episodeTopics.rankedAt,
                new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              ),
            ),
          )
          .groupBy(episodeTopics.episodeId);
      } catch (err) {
        console.error(
          "Failed to fetch topic rank enrichment; returning episodes without rank data:",
          err,
        );
      }
    }

    const rankMap = new Map(topicRankRows.map((r) => [r.episodeId, r]));

    const baseEnriched = results.map((r) => {
      const rankData = rankMap.get(r.id);
      return {
        ...r,
        bestTopicRank: rankData?.bestRank ?? null,
        topRankedTopic: rankData?.topTopic ?? null,
      };
    });

    let overlapEnriched: RecommendedEpisodeDTO[] = baseEnriched;
    try {
      const { profile: userProfile, totalConsumed } =
        await fetchUserTopicProfile(userId);

      // Batch-query topics for all candidate episodes
      const candidateIds = baseEnriched.map((r) => r.id);
      let candidateTopicRows: Array<{
        episodeId: number;
        topic: string;
        relevance: string;
      }> = [];
      if (candidateIds.length > 0) {
        candidateTopicRows = await db
          .select({
            episodeId: episodeTopics.episodeId,
            topic: episodeTopics.topic,
            relevance: episodeTopics.relevance,
          })
          .from(episodeTopics)
          .where(inArray(episodeTopics.episodeId, candidateIds))
          .orderBy(desc(episodeTopics.relevance));
      }

      // Group candidate topics by episode
      const candidateTopicMap = new Map<
        number,
        Array<{ topic: string; relevance: string }>
      >();
      for (const row of candidateTopicRows) {
        const existing = candidateTopicMap.get(row.episodeId) ?? [];
        existing.push({ topic: row.topic, relevance: row.relevance });
        candidateTopicMap.set(row.episodeId, existing);
      }

      // Compute overlap for each candidate and attach to DTO
      const withOverlap: RecommendedEpisodeDTO[] = baseEnriched.map((r) => {
        const epTopics = candidateTopicMap.get(r.id) ?? [];
        const overlap = computeTopicOverlap(
          userProfile,
          epTopics,
          totalConsumed,
          r.bestTopicRank,
        );
        return {
          ...r,
          overlapCount: overlap.overlapCount,
          overlapTopic: overlap.topOverlapTopic,
          overlapLabel: overlap.label,
          overlapLabelKind: overlap.labelKind,
        };
      });

      // Stable partition sort: non-overlapping (overlapCount < 3) first, overlapping last.
      // Within each partition, original order (worthItScore DESC) is preserved.
      const nonOverlapping = withOverlap.filter(
        (r) => (r.overlapCount ?? 0) < HIGH_OVERLAP_THRESHOLD,
      );
      const overlapping = withOverlap.filter(
        (r) => (r.overlapCount ?? 0) >= HIGH_OVERLAP_THRESHOLD,
      );
      overlapEnriched = [...nonOverlapping, ...overlapping];
    } catch (err) {
      console.error(
        "Failed to compute topic overlap; returning recommendations without overlap data:",
        err,
      );
    }

    return { episodes: overlapEnriched, error: null };
  } catch (error) {
    console.error("Error fetching episode recommendations:", error);
    return { episodes: [], error: "Failed to load recommendations" };
  }
}

// Get topic overlap for a single episode — used by the episode detail page.
export async function getEpisodeTopicOverlap(podcastIndexEpisodeId: string) {
  if (!podcastIndexEpisodeId) return EMPTY_OVERLAP_RESULT;

  const { userId } = await auth();
  if (!userId) return EMPTY_OVERLAP_RESULT;

  try {
    // Parallelize: episode lookup and user profile construction are independent
    const [episodeRow, profileResult] = await Promise.all([
      db
        .select({ id: episodes.id })
        .from(episodes)
        .where(eq(episodes.podcastIndexId, podcastIndexEpisodeId))
        .limit(1),
      fetchUserTopicProfile(userId),
    ]);

    if (episodeRow.length === 0) return EMPTY_OVERLAP_RESULT;
    const episodeDbId = episodeRow[0].id;
    const { profile: userProfile, totalConsumed } = profileResult;

    const epTopicRows = await db
      .select({
        topic: episodeTopics.topic,
        relevance: episodeTopics.relevance,
        topicRank: episodeTopics.topicRank,
      })
      .from(episodeTopics)
      .where(eq(episodeTopics.episodeId, episodeDbId))
      .orderBy(desc(episodeTopics.relevance));

    const epTopics = epTopicRows.map((r) => ({
      topic: r.topic,
      relevance: r.relevance,
    }));
    const bestRank = epTopicRows.reduce<number | null>((best, r) => {
      if (r.topicRank === null) return best;
      if (best === null) return r.topicRank;
      return Math.min(best, r.topicRank);
    }, null);

    return computeTopicOverlap(userProfile, epTopics, totalConsumed, bestRank);
  } catch (err) {
    console.error("Failed to compute episode topic overlap:", err);
    return EMPTY_OVERLAP_RESULT;
  }
}

// Get stats for the dashboard
export async function getDashboardStats() {
  const { userId } = await auth();

  if (!userId) {
    return {
      subscriptionCount: 0,
      savedCount: 0,
      error: "You must be signed in",
    };
  }

  try {
    const [subscriptionCount, savedCount] = await Promise.all([
      db.$count(userSubscriptions, eq(userSubscriptions.userId, userId)),
      db.$count(userLibrary, eq(userLibrary.userId, userId)),
    ]);

    return {
      subscriptionCount,
      savedCount,
      error: null,
    };
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return {
      subscriptionCount: 0,
      savedCount: 0,
      error: "Failed to load stats",
    };
  }
}

// Get latest trending topics snapshot
export async function getTrendingTopics() {
  const { userId } = await auth();

  if (!userId) {
    return { topics: null, error: "You must be signed in" };
  }

  try {
    const latest = await db.query.trendingTopics.findFirst({
      orderBy: [desc(trendingTopics.generatedAt), desc(trendingTopics.id)],
    });

    if (!latest) {
      return { topics: null, error: null };
    }

    return {
      topics: {
        items: latest.topics,
        generatedAt: latest.generatedAt,
        periodStart: latest.periodStart,
        periodEnd: latest.periodEnd,
        episodeCount: latest.episodeCount,
      },
      error: null,
    };
  } catch (error) {
    console.error("Error fetching trending topics:", error);
    return { topics: null, error: "Failed to load trending topics" };
  }
}

export type TrendingTopicDetailResult =
  | { kind: "no-snapshot" }
  | { kind: "unknown-slug"; allTopics: TrendingTopic[]; generatedAt: Date }
  | {
      kind: "found";
      topic: TrendingTopic;
      allTopics: TrendingTopic[];
      episodes: RecommendedEpisodeDTO[];
      generatedAt: Date;
    }
  | { kind: "error"; message: string };

export async function getTrendingTopicBySlug(
  slug: string,
): Promise<TrendingTopicDetailResult> {
  const { userId } = await auth();
  if (!userId) {
    // Encode the slug so a value like `foo&evil=injected` can't smuggle extra
    // query parameters into the /sign-in URL.
    redirect(
      `/sign-in?redirect_url=${encodeURIComponent(`/trending/${slug}`)}`,
    );
  }

  try {
    const latest = await db.query.trendingTopics.findFirst({
      orderBy: [desc(trendingTopics.generatedAt), desc(trendingTopics.id)],
    });

    if (!latest) return { kind: "no-snapshot" };

    const allTopics = latest.topics;
    const topic = allTopics.find((t) => getTopicSlug(t) === slug);

    if (!topic) {
      return {
        kind: "unknown-slug",
        allTopics,
        generatedAt: latest.generatedAt,
      };
    }

    if (topic.episodeIds.length === 0) {
      return {
        kind: "found",
        topic,
        allTopics,
        episodes: [],
        generatedAt: latest.generatedAt,
      };
    }

    // Safety cap against corrupted/malicious snapshots with huge episodeIds arrays.
    // The display limit below runs at the DB layer so ordering applies to the full
    // candidate set — truncating by LLM-output order here would silently drop
    // high-scored episodes at positions beyond the cap.
    if (topic.episodeIds.length > 500) {
      console.warn("Trending topic exceeded 500-episode safety cap:", {
        slug,
        name: topic.name,
        actualLength: topic.episodeIds.length,
      });
    }
    const episodeIds = topic.episodeIds.slice(0, 500);

    const rows = await db
      .select({
        id: episodes.id,
        podcastIndexId: episodes.podcastIndexId,
        title: episodes.title,
        description: episodes.description,
        audioUrl: episodes.audioUrl,
        duration: episodes.duration,
        publishDate: episodes.publishDate,
        worthItScore: episodes.worthItScore,
        podcastTitle: podcasts.title,
        podcastImageUrl: podcasts.imageUrl,
      })
      .from(episodes)
      .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
      .where(inArray(episodes.id, episodeIds))
      // Postgres defaults DESC to NULLS FIRST; we want unscored episodes at the
      // bottom, and drizzle's desc() helper doesn't expose the nulls-ordering flag.
      .orderBy(
        sql`${episodes.worthItScore} DESC NULLS LAST`,
        desc(episodes.publishDate),
      )
      // Display cap — bounds page render cost. Sort runs over the full candidate
      // set above so top-scored episodes can't be missed beyond this limit.
      .limit(50);

    const episodesList: RecommendedEpisodeDTO[] = rows.map((r) => ({
      ...r,
      bestTopicRank: null,
      topRankedTopic: null,
    }));

    return {
      kind: "found",
      topic,
      allTopics,
      episodes: episodesList,
      generatedAt: latest.generatedAt,
    };
  } catch (error) {
    console.error("Error fetching trending topic by slug:", { slug, error });
    return { kind: "error", message: "Failed to load topic" };
  }
}

// Export types for use in components
export type RecentEpisode = PodcastIndexEpisode & {
  podcastTitle: string;
  podcastImage: string | null;
  podcastId: string;
  worthItScore: number | null;
};
