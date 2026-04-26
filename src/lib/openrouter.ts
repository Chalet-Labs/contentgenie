import type { AiMessage } from "@/lib/ai/types";

/** @deprecated Use `AiMessage` from `@/lib/ai` instead. */
export type OpenRouterMessage = AiMessage;

/** The 8 boolean quality signals the LLM evaluates. */
export interface WorthItSignals {
  hasActionableInsights: boolean;
  hasNearTermApplicability: boolean;
  staysFocused: boolean;
  goesBeyondSurface: boolean;
  isWellStructured: boolean;
  timeJustified: boolean;
  hasConcreteExamples: boolean;
  hasExpertPerspectives: boolean;
}

/** All valid signal keys, for iteration. */
export const WORTH_IT_SIGNAL_KEYS: readonly (keyof WorthItSignals)[] = [
  "hasActionableInsights",
  "hasNearTermApplicability",
  "staysFocused",
  "goesBeyondSurface",
  "isWellStructured",
  "timeJustified",
  "hasConcreteExamples",
  "hasExpertPerspectives",
] as const;

/** Human-readable labels for each signal, used in UI and prompt. */
export const SIGNAL_LABELS: Record<keyof WorthItSignals, string> = {
  hasActionableInsights: "Contains 3+ actionable insights",
  hasNearTermApplicability: "Listener could apply something within a week",
  staysFocused: "Editorial content stays focused, low filler-to-content ratio",
  goesBeyondSurface: "Goes beyond surface-level discussion",
  isWellStructured: "Well-structured and easy to follow",
  timeJustified: "Time investment justified by editorial content density",
  hasConcreteExamples: "Includes concrete examples, data, or evidence",
  hasExpertPerspectives: "Features expert/practitioner perspectives",
};

/** Discriminated union for backward compatibility with legacy dimension format. */
export type WorthItDimensionsData =
  | {
      kind: "signals";
      signals: WorthItSignals;
      adjustment: -1 | 0 | 1;
      adjustmentReason: string;
    }
  | {
      kind: "dimensions";
      uniqueness: number;
      actionability: number;
      timeValue: number;
    };

/**
 * Kind taxonomy for canonical-topic candidates emitted by the summarizer.
 * Matches the spec at .dev/pm/specs/2026-04-25-canonical-topics-foundation.md
 * and feeds the entity-resolution module (A4 / #384). Do not extend without
 * an ADR — the Drizzle enum on the canonical_topics table (A2 / #383) must
 * stay in sync.
 */
export const TOPIC_KINDS = [
  "release",
  "incident",
  "regulation",
  "announcement",
  "deal",
  "event",
  "concept",
  "work",
  "other",
] as const;
export type TopicKind = (typeof TOPIC_KINDS)[number];

/** Broad professional tag layer — written to episode_topics. */
export interface NormalizedCategory {
  name: string;
  relevance: number;
}

/** Canonical-topic candidate layer — consumed by entity resolution (A4/A5). */
export interface NormalizedTopic {
  label: string;
  kind: TopicKind;
  summary: string;
  aliases: string[];
  ongoing: boolean;
  relevance: number;
  coverageScore: number;
}

export interface SummaryResult {
  summary: string;
  keyTakeaways: string[];
  worthItScore: number;
  worthItReason: string;
  worthItDimensions?: WorthItDimensionsData;
  // Both layers are optional so independent try/catch failures in the caller
  // can leave one undefined without breaking the other (mirrors ADR-031).
  categories?: NormalizedCategory[];
  topics?: NormalizedTopic[];
}

// Parse a JSON response from the LLM, handling potential markdown code blocks
export function parseJsonResponse<T>(content: string): T {
  // Remove markdown code blocks if present
  let cleanedContent = content.trim();

  // Handle ```json ... ``` format
  if (cleanedContent.startsWith("```json")) {
    cleanedContent = cleanedContent.slice(7);
  } else if (cleanedContent.startsWith("```")) {
    cleanedContent = cleanedContent.slice(3);
  }

  if (cleanedContent.endsWith("```")) {
    cleanedContent = cleanedContent.slice(0, -3);
  }

  cleanedContent = cleanedContent.trim();

  try {
    return JSON.parse(cleanedContent) as T;
  } catch (error) {
    const snippet = cleanedContent.slice(0, 200);
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to parse LLM response as JSON: ${reason}\nRaw response (first 200 chars): ${snippet}`,
      { cause: error },
    );
  }
}
