import { logger, metadata } from "@trigger.dev/sdk";

import { generateEmbeddings } from "@/lib/ai/embed";
import { resolveTopic } from "@/lib/entity-resolution";
import {
  MAX_DISAMBIG_CALLS_PER_EPISODE,
  type MatchMethod,
} from "@/lib/entity-resolution-constants";
import type { NormalizedTopic } from "@/lib/openrouter";
import { forceInsertNewCanonical } from "@/trigger/helpers/database";

export interface ResolveTopicsResult {
  resolved: number;
  failed: number;
  matchMethodDistribution: Record<MatchMethod, number>;
  versionTokenForcedDisambig: number;
  candidatesConsidered: { p50: number; max: number };
  budgetExhausted: boolean;
  topicCount: number;
}

export interface ResolveTopicsOptions {
  /** When true, skip resolution entirely (custom-prompt users). Returns zeroed metrics. */
  skipResolution?: boolean;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function identityText(topic: NormalizedTopic): string {
  if (topic.aliases.length === 0) return topic.label;
  return `${topic.label} | ${topic.aliases.join(", ")}`;
}

function contextText(topic: NormalizedTopic): string {
  if (!topic.summary) return topic.label;
  return `${topic.label} — ${topic.summary}`;
}

export async function resolveAndPersistEpisodeTopics(
  episodeId: number,
  topics: NormalizedTopic[],
  _summary: string,
  opts?: ResolveTopicsOptions,
): Promise<ResolveTopicsResult> {
  const topicCount = topics.length;

  if (opts?.skipResolution || topicCount === 0) {
    return {
      resolved: 0,
      failed: 0,
      matchMethodDistribution: { auto: 0, llm_disambig: 0, new: 0 },
      versionTokenForcedDisambig: 0,
      candidatesConsidered: { p50: 0, max: 0 },
      budgetExhausted: false,
      topicCount,
    };
  }

  const identityTexts = topics.map(identityText);
  const contextTexts = topics.map(contextText);

  let identityEmbeddings: number[][];
  let contextEmbeddings: number[][];
  try {
    [identityEmbeddings, contextEmbeddings] = await Promise.all([
      generateEmbeddings(identityTexts),
      generateEmbeddings(contextTexts),
    ]);
  } catch (err) {
    logger.warn(
      "[resolve-topics] embedding batch failed — failing all topics",
      {
        episodeId,
        topicCount,
        err,
      },
    );
    metadata.root.increment("topics_resolved", 0);
    metadata.root.increment("topics_failed", topicCount);
    return {
      resolved: 0,
      failed: topicCount,
      matchMethodDistribution: { auto: 0, llm_disambig: 0, new: 0 },
      versionTokenForcedDisambig: 0,
      candidatesConsidered: { p50: 0, max: 0 },
      budgetExhausted: false,
      topicCount,
    };
  }

  let resolved = 0;
  let failed = 0;
  let disambigCount = 0;
  let budgetExhausted = false;
  let versionTokenForcedDisambig = 0;
  const matchMethodDistribution: Record<MatchMethod, number> = {
    auto: 0,
    llm_disambig: 0,
    new: 0,
  };
  const candidatesSamples: number[] = [];

  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    const input = {
      ...topic,
      episodeId,
      identityEmbedding: identityEmbeddings[i] as readonly number[],
      contextEmbedding: contextEmbeddings[i] as readonly number[],
    };

    try {
      let result;
      if (disambigCount >= MAX_DISAMBIG_CALLS_PER_EPISODE) {
        result = await forceInsertNewCanonical(input);
        budgetExhausted = true;
      } else {
        result = await resolveTopic(input);
        if (result.matchMethod === "llm_disambig") disambigCount++;
      }

      matchMethodDistribution[result.matchMethod]++;
      if (result.versionTokenForcedDisambig) versionTokenForcedDisambig++;
      if (result.candidatesConsidered > 0)
        candidatesSamples.push(result.candidatesConsidered);
      resolved++;
    } catch (err) {
      failed++;
      logger.warn("[resolve-topics] per-topic failure", {
        episodeId,
        topicLabel: topic.label,
        err,
      });
    }
  }

  const candidatesConsidered = {
    p50: median(candidatesSamples),
    max: candidatesSamples.length > 0 ? Math.max(...candidatesSamples) : 0,
  };

  logger.info("[resolve-topics] episode resolved", {
    episodeId,
    resolved,
    failed,
    matchMethodDistribution,
    versionTokenForcedDisambig,
    candidatesConsidered,
    budgetExhausted,
    topicCount,
  });

  metadata.root.increment("topics_resolved", resolved);
  metadata.root.increment("topics_failed", failed);

  return {
    resolved,
    failed,
    matchMethodDistribution,
    versionTokenForcedDisambig,
    candidatesConsidered,
    budgetExhausted,
    topicCount,
  };
}
