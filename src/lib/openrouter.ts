import type { AiMessage } from "@/lib/ai";

export { generateCompletion } from "@/lib/ai";

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
  staysFocused: "Episode stays focused, low filler-to-content ratio",
  goesBeyondSurface: "Goes beyond surface-level discussion",
  isWellStructured: "Well-structured and easy to follow",
  timeJustified: "Time investment justified by content density",
  hasConcreteExamples: "Includes concrete examples, data, or evidence",
  hasExpertPerspectives: "Features expert/practitioner perspectives",
};

/** Discriminated union for backward compatibility with legacy dimension format. */
export type WorthItDimensionsData =
  | { kind: "signals"; signals: WorthItSignals; adjustment: -1 | 0 | 1; adjustmentReason: string }
  | { kind: "dimensions"; uniqueness: number; actionability: number; timeValue: number };

export interface SummaryResult {
  summary: string;
  keyTakeaways: string[];
  worthItScore: number;
  worthItReason: string;
  worthItDimensions?: WorthItDimensionsData;
  topics?: Array<{ name: string; relevance: number }>;
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

  return JSON.parse(cleanedContent) as T;
}
