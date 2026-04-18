import { schedules, logger } from "@trigger.dev/sdk";
import { eq, gte, lte, desc, and, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { episodes, trendingTopics, type TrendingTopic } from "@/db/schema";
import { generateCompletion } from "@/lib/ai";
import {
  TRENDING_TOPICS_SYSTEM_PROMPT,
  getTrendingTopicsPrompt,
} from "@/lib/prompts";
import { parseJsonResponse } from "@/lib/openrouter";
import { slugify } from "@/lib/utils";

const LOOKBACK_DAYS = 7;
const MAX_EPISODES = 200;
const MAX_TOPICS = 8;
// Reasoning-capable Z.AI models (GLM-4.6/5.x) burn tokens on chain-of-thought
// before emitting `content`; 16k leaves headroom after reasoning so the topic
// JSON isn't truncated mid-output.
const TRENDING_MAX_TOKENS = 16000;

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

    const persistSnapshot = async (
      topics: TrendingTopic[],
      episodeCount: number
    ) => {
      await db.insert(trendingTopics).values({
        topics,
        generatedAt: now,
        periodStart,
        periodEnd,
        episodeCount,
      });
    };

    logger.info("Starting trending topics generation", {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });

    // Query all completed episodes in the window (JS filters summary downstream for LLM input)
    const recentEpisodes = await db
      .select({
        id: episodes.id,
        title: episodes.title,
        summary: episodes.summary,
      })
      .from(episodes)
      .where(
        and(
          eq(episodes.summaryStatus, "completed"),
          isNotNull(episodes.processedAt),
          gte(episodes.processedAt, periodStart),
          lte(episodes.processedAt, periodEnd)
        )
      )
      .orderBy(desc(episodes.processedAt))
      .limit(MAX_EPISODES);

    if (recentEpisodes.length === MAX_EPISODES) {
      logger.warn("Episode query hit MAX_EPISODES cap; snapshot may be incomplete", {
        cap: MAX_EPISODES,
      });
    }

    logger.info("Found summarized episodes in window", {
      count: recentEpisodes.length,
    });

    // Handle empty window: store empty topics
    if (recentEpisodes.length === 0) {
      await persistSnapshot([], 0);
      logger.info("No episodes in window, stored empty snapshot");
      return { episodeCount: 0, topicCount: 0 };
    }

    // Build LLM input (JS filters episodes without a usable summary)
    const episodesWithSummary = recentEpisodes
      .filter(
        (ep): ep is typeof ep & { summary: string } =>
          typeof ep.summary === "string" && ep.summary.trim().length > 0
      )
      .map((ep) => ({
        id: ep.id,
        title: ep.title,
        summary: ep.summary,
      }));

    // If no episodes have a summary, store empty
    if (episodesWithSummary.length === 0) {
      await persistSnapshot([], recentEpisodes.length);
      logger.info("No episodes with summary in window, stored empty snapshot");
      return { episodeCount: recentEpisodes.length, topicCount: 0 };
    }

    // Generate topic clusters via LLM. Wrapped so provider failures (Z.AI
    // balance, reasoning-token exhaustion, etc.) persist an empty snapshot
    // instead of crashing the run — the dashboard's empty-state + stale
    // banner then make the outage visible to users.
    const prompt = getTrendingTopicsPrompt(episodesWithSummary);
    let completion: string;
    try {
      completion = await generateCompletion(
        [
          { role: "system", content: TRENDING_TOPICS_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        { maxTokens: TRENDING_MAX_TOKENS }
      );
    } catch (err) {
      logger.error("LLM call failed in trending topics generation", {
        error: err instanceof Error ? err.message : String(err),
      });
      await persistSnapshot([], recentEpisodes.length);
      return { episodeCount: recentEpisodes.length, topicCount: 0 };
    }

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
          typeof t.description === "string" &&
          Array.isArray(t.episodeIds) &&
          t.episodeIds.every((id: unknown) => Number.isInteger(id))
      );
    } catch (err) {
      logger.error("Failed to parse LLM response", {
        error: err instanceof Error ? err.message : String(err),
        rawResponse: completion.slice(0, 500),
      });
      // Store empty on parse failure rather than throwing (prevents stale data)
      topics = [];
    }

    // If parsing failed completely, store empty snapshot explicitly
    if (topics.length === 0) {
      await persistSnapshot([], recentEpisodes.length);
      logger.info("No valid topics after parsing/validation, stored empty snapshot");
      return { episodeCount: recentEpisodes.length, topicCount: 0 };
    }

    // Validate: filter out topics referencing invalid episode IDs
    const validEpisodeIds = new Set(episodesWithSummary.map((ep) => ep.id));
    const mappedTopics = topics
      .map((topic) => {
        const filteredIds = Array.from(new Set(topic.episodeIds)).filter((id) =>
          validEpisodeIds.has(id)
        );
        return {
          name: topic.name,
          description: topic.description,
          episodeIds: filteredIds,
          episodeCount: filteredIds.length,
          slug: slugify(topic.name),
        };
      })
      .filter((topic) => topic.episodeCount > 0);

    const keptTopics: typeof mappedTopics = [];
    const droppedNames: string[] = [];
    for (const topic of mappedTopics) {
      if (topic.slug === "") droppedNames.push(topic.name);
      else keptTopics.push(topic);
    }
    if (droppedNames.length > 0) {
      logger.warn("Dropped trending topics with empty slug (non-ASCII or punctuation-only names)", {
        droppedCount: droppedNames.length,
        droppedNames: droppedNames.slice(0, 10),
      });
    }

    const validatedTopics = keptTopics
      .sort((a, b) => b.episodeCount - a.episodeCount)
      .slice(0, MAX_TOPICS);

    // Disambiguate duplicate slugs. Track already-assigned final slugs (not
    // just bases) so a disambiguated form like "foo-2" cannot collide with
    // another topic whose natural slug is also "foo-2".
    const assignedSlugs = new Set<string>();
    for (const topic of validatedTopics) {
      const base = topic.slug;
      let candidate = base;
      let n = 2;
      while (assignedSlugs.has(candidate)) {
        candidate = `${base}-${n}`;
        n++;
      }
      topic.slug = candidate;
      assignedSlugs.add(candidate);
    }

    if (validatedTopics.length === 0 && topics.length > 0) {
      logger.warn("All LLM topics referenced invalid episode IDs, storing empty snapshot", {
        parsedTopicCount: topics.length,
      });
    }

    // Store snapshot
    await persistSnapshot(validatedTopics, recentEpisodes.length);

    const result = {
      episodeCount: recentEpisodes.length,
      topicCount: validatedTopics.length,
    };

    logger.info("Trending topics generation complete", result);
    return result;
  },
});
