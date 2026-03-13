import { schedules, logger } from "@trigger.dev/sdk";
import { eq, gte, and, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { episodes, trendingTopics, type TrendingTopic } from "@/db/schema";
import { generateCompletion } from "@/lib/ai";
import {
  TRENDING_TOPICS_SYSTEM_PROMPT,
  getTrendingTopicsPrompt,
} from "@/lib/prompts";
import { parseJsonResponse } from "@/lib/openrouter";

const LOOKBACK_DAYS = 7;

/**
 * Daily scheduled task that analyzes recent episode summaries via LLM
 * and stores trending topic clusters in the database.
 */
export const generateTrendingTopics = schedules.task({
  id: "generate-trending-topics",
  cron: "0 6 * * *", // Daily at 6 AM UTC
  maxDuration: 120,
  retry: { maxAttempts: 2 },
  run: async () => {
    const now = new Date();
    const periodStart = new Date(
      now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000
    );
    const periodEnd = now;

    logger.info("Starting trending topics generation", {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });

    // Query recently summarized episodes (title + keyTakeaways only for token efficiency)
    const recentEpisodes = await db
      .select({
        id: episodes.id,
        title: episodes.title,
        keyTakeaways: episodes.keyTakeaways,
      })
      .from(episodes)
      .where(
        and(
          eq(episodes.summaryStatus, "completed"),
          isNotNull(episodes.processedAt),
          gte(episodes.processedAt, periodStart)
        )
      );

    logger.info("Found summarized episodes in window", {
      count: recentEpisodes.length,
    });

    // Handle empty window: store empty topics
    if (recentEpisodes.length === 0) {
      await db.insert(trendingTopics).values({
        topics: [],
        generatedAt: now,
        periodStart,
        periodEnd,
        episodeCount: 0,
      });

      logger.info("No episodes in window, stored empty snapshot");
      return { episodeCount: 0, topicCount: 0 };
    }

    // Build LLM input (only episodes with takeaways)
    const episodesWithTakeaways = recentEpisodes
      .filter((ep) => ep.keyTakeaways && ep.keyTakeaways.length > 0)
      .map((ep) => ({
        id: ep.id,
        title: ep.title,
        keyTakeaways: ep.keyTakeaways!,
      }));

    // If all episodes lack takeaways, store empty
    if (episodesWithTakeaways.length === 0) {
      await db.insert(trendingTopics).values({
        topics: [],
        generatedAt: now,
        periodStart,
        periodEnd,
        episodeCount: recentEpisodes.length,
      });

      logger.info("All episodes lack takeaways, stored empty snapshot");
      return { episodeCount: recentEpisodes.length, topicCount: 0 };
    }

    // Generate topic clusters via LLM
    const prompt = getTrendingTopicsPrompt(episodesWithTakeaways);
    const completion = await generateCompletion([
      { role: "system", content: TRENDING_TOPICS_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ]);

    let topics: TrendingTopic[];
    try {
      const parsed = parseJsonResponse<{ topics: TrendingTopic[] }>(completion);
      topics = parsed.topics;

      // Defensive: validate LLM returned expected shape
      if (!Array.isArray(topics)) {
        logger.error("LLM returned non-array topics", { type: typeof topics });
        topics = [];
      }
      topics = topics.filter(
        (t) =>
          typeof t === "object" &&
          t !== null &&
          typeof t.name === "string" &&
          Array.isArray(t.episodeIds)
      );
    } catch (err) {
      logger.error("Failed to parse LLM response", {
        error: err instanceof Error ? err.message : String(err),
        rawResponse: completion.slice(0, 500),
      });
      // Store empty on parse failure rather than throwing (prevents stale data)
      topics = [];
    }

    // Validate: filter out topics referencing invalid episode IDs
    const validEpisodeIds = new Set(episodesWithTakeaways.map((ep) => ep.id));
    const validatedTopics = topics
      .map((topic) => {
        const filteredIds = topic.episodeIds.filter((id) =>
          validEpisodeIds.has(id)
        );
        return {
          ...topic,
          episodeIds: filteredIds,
          episodeCount: filteredIds.length,
        };
      })
      .filter((topic) => topic.episodeCount > 0);

    // Store snapshot
    await db.insert(trendingTopics).values({
      topics: validatedTopics,
      generatedAt: now,
      periodStart,
      periodEnd,
      episodeCount: episodesWithTakeaways.length,
    });

    const result = {
      episodeCount: episodesWithTakeaways.length,
      topicCount: validatedTopics.length,
    };

    logger.info("Trending topics generation complete", result);
    return result;
  },
});
