import type { AiMessage } from "@/lib/ai";

export { generateCompletion } from "@/lib/ai";

/** @deprecated Use `AiMessage` from `@/lib/ai` instead. */
export type OpenRouterMessage = AiMessage;

export interface SummaryResult {
  summary: string;
  keyTakeaways: string[];
  worthItScore: number;
  worthItReason: string;
  worthItDimensions?: {
    uniqueness: number;
    actionability: number;
    timeValue: number;
  };
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
