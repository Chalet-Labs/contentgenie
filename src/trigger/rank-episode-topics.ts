import { schedules, logger } from "@trigger.dev/sdk";
import { eq, gte, desc, and, sql, count } from "drizzle-orm";
import { db } from "@/db";
import { episodes, episodeTopics } from "@/db/schema";
import { generateCompletion } from "@/lib/ai";
import { parseJsonResponse } from "@/lib/openrouter";
import {
  generateAllPairs,
  aggregateWinCounts,
  getEpisodeCap,
  MAX_TOPICS_PER_RUN,
  type PairwiseResult,
} from "@/trigger/helpers/topic-ranking";
import { parseScore } from "@/lib/score-utils";
import {
  TOPIC_RANKING_SYSTEM_PROMPT,
  getTopicComparisonPrompt,
} from "@/lib/prompts";

const LOOKBACK_DAYS = 30;

/**
 * Daily scheduled task that ranks episodes within each topic using pairwise
 * LLM comparisons. Stores results in episode_topics.topic_rank.
 */
export const rankEpisodeTopics = schedules.task({
  id: "rank-episode-topics",
  cron: "0 7 * * *", // Daily at 7 AM UTC, 1 hour after trending topics
  maxDuration: 600,
  retry: { maxAttempts: 2 },
  run: async () => {
    const windowStart = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    logger.info("Starting cross-episode topic ranking", {
      windowStart: windowStart.toISOString(),
    });

    // Step 1: Query topics with 3+ summarized episodes in the 30-day window
    const topicRows = await db
      .select({
        topic: episodeTopics.topic,
        episodeCount: count(episodeTopics.episodeId),
      })
      .from(episodeTopics)
      .innerJoin(episodes, eq(episodeTopics.episodeId, episodes.id))
      .where(
        and(
          eq(episodes.summaryStatus, "completed"),
          gte(episodes.processedAt, windowStart)
        )
      )
      .groupBy(episodeTopics.topic)
      .having(sql`COUNT(${episodeTopics.episodeId}) >= 3`)
      .orderBy(desc(count(episodeTopics.episodeId)));

    const qualifyingTopics = topicRows.slice(0, MAX_TOPICS_PER_RUN);

    if (topicRows.length > MAX_TOPICS_PER_RUN) {
      logger.warn("Qualifying topics exceeded cap; some topics will be skipped", {
        total: topicRows.length,
        cap: MAX_TOPICS_PER_RUN,
      });
    }

    if (qualifyingTopics.length === 0) {
      logger.info("No qualifying topics found");
      return { topicsRanked: 0, comparisonsRun: 0, comparisonsFailed: 0 };
    }

    // Step 1b: Compute adaptive episode cap based on number of qualifying topics
    const episodeCap = getEpisodeCap(qualifyingTopics.length);

    logger.info("Qualifying topics found", {
      count: qualifyingTopics.length,
      episodeCap,
    });

    let topicsRanked = 0;
    let comparisonsRun = 0;
    let comparisonsFailed = 0;

    for (const { topic } of qualifyingTopics) {
      // Step 2: Fetch top N episodes for this topic by worthItScore DESC
      const episodeRows = await db
        .select({
          episodeId: episodeTopics.episodeId,
          title: episodes.title,
          summary: episodes.summary,
          worthItScore: episodes.worthItScore,
        })
        .from(episodeTopics)
        .innerJoin(episodes, eq(episodeTopics.episodeId, episodes.id))
        .where(
          and(
            eq(episodeTopics.topic, topic),
            eq(episodes.summaryStatus, "completed"),
            gte(episodes.processedAt, windowStart)
          )
        )
        .orderBy(desc(episodes.worthItScore))
        .limit(episodeCap);

      if (episodeRows.length < 2) {
        continue;
      }

      // Step 3: Generate all pairs
      const pairs = generateAllPairs(episodeRows);

      // Step 4: Run pairwise comparisons sequentially
      const results: PairwiseResult[] = [];
      for (const [epA, epB] of pairs) {
        try {
          const userPrompt = getTopicComparisonPrompt(
            topic,
            epA.title,
            epA.summary ?? "",
            epB.title,
            epB.summary ?? ""
          );
          const completion = await generateCompletion(
            [
              { role: "system", content: TOPIC_RANKING_SYSTEM_PROMPT },
              { role: "user", content: userPrompt },
            ],
            { temperature: 0.1, maxTokens: 256 }
          );
          const parsed = parseJsonResponse<{ winner: "A" | "B" | "tie"; reason: string }>(
            completion
          );
          if (
            parsed.winner !== "A" &&
            parsed.winner !== "B" &&
            parsed.winner !== "tie"
          ) {
            throw new Error(`Invalid winner value: ${String(parsed.winner)}`);
          }
          results.push({
            episodeIdA: epA.episodeId,
            episodeIdB: epB.episodeId,
            winner: parsed.winner,
          });
          comparisonsRun++;
        } catch (err) {
          logger.warn("Pairwise comparison failed; skipping pair", {
            topic,
            episodeIdA: epA.episodeId,
            episodeIdB: epB.episodeId,
            error: err instanceof Error ? err.message : String(err),
          });
          comparisonsFailed++;
        }
      }

      if (results.length === 0) {
        logger.warn("All comparisons failed for topic; skipping", { topic });
        continue;
      }

      // Step 5: Aggregate results and persist ranks
      const episodeIds = episodeRows.map((r) => r.episodeId);
      const scores = new Map(
        episodeRows.map((r) => [r.episodeId, parseScore(r.worthItScore)])
      );
      const ranked = aggregateWinCounts(results, episodeIds, scores);

      const rankedAt = new Date();
      await Promise.all(
        ranked.map(({ episodeId, rank }) =>
          db
            .update(episodeTopics)
            .set({ topicRank: rank, rankedAt })
            .where(
              and(
                eq(episodeTopics.episodeId, episodeId),
                eq(episodeTopics.topic, topic)
              )
            )
        )
      );

      topicsRanked++;
    }

    const result = { topicsRanked, comparisonsRun, comparisonsFailed };
    logger.info("Topic ranking complete", result);
    return result;
  },
});
