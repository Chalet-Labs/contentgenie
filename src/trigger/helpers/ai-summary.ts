import { generateCompletion } from "@/lib/ai";
import { parseJsonResponse, type SummaryResult } from "@/lib/openrouter";
import { SYSTEM_PROMPT, getSummarizationPrompt } from "@/lib/prompts";
import { interpolatePrompt } from "@/lib/admin/prompt-utils";
import type { PodcastIndexPodcast, PodcastIndexEpisode } from "@/lib/podcastindex";

// File-private helper — not exported. If a second consumer appears, extract it then.
function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

export type { SummaryResult } from "@/lib/openrouter";

export async function generateEpisodeSummary(
  podcast: PodcastIndexPodcast | undefined,
  episode: PodcastIndexEpisode,
  transcript: string,
  customPrompt?: string | null
): Promise<SummaryResult> {
  const prompt =
    customPrompt
      ? interpolatePrompt(customPrompt, {
          title: episode.title,
          podcastName: podcast?.title || "Unknown Podcast",
          description: episode.description || "",
          duration: episode.duration || 0,
          transcript,
        })
      : getSummarizationPrompt(
          podcast?.title || "Unknown Podcast",
          episode.title,
          episode.description || "",
          episode.duration || 0,
          transcript
        );

  const completion = await generateCompletion([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ]);

  try {
    const result = parseJsonResponse<SummaryResult>(completion);
    // Recalculate worthItScore server-side from dimensions to ensure arithmetic accuracy
    if (result.worthItDimensions) {
      const { uniqueness, actionability, timeValue } = result.worthItDimensions;
      if (
        typeof uniqueness === "number" &&
        typeof actionability === "number" &&
        typeof timeValue === "number"
      ) {
        const computed = parseFloat(((uniqueness + actionability + timeValue) / 3).toFixed(1));
        if (result.worthItScore !== computed) {
          console.warn(
            `[ai-summary] worthItScore mismatch: LLM=${result.worthItScore}, computed=${computed}. Using computed value.`
          );
        }
        result.worthItScore = computed;
      }
    }

    // Validate and normalize topics
    if (Array.isArray(result.topics)) {
      // 1. Filter: drop entries missing name or relevance
      const valid = result.topics.filter(
        (t): t is { name: string; relevance: number } =>
          typeof t === "object" &&
          t !== null &&
          typeof t.name === "string" &&
          t.name.trim().length > 0 &&
          t.name.trim().length <= 100 &&
          typeof t.relevance === "number" &&
          !Number.isNaN(t.relevance)
      );
      // 2. Normalize: title-case name, clamp relevance to [0, 1]
      // 3. Deduplicate by normalized name using Map for O(1) lookup (keep highest relevance)
      // case-insensitivity is provided by toTitleCase() above, not by the Map key comparison
      const deduped = new Map<string, { name: string; relevance: number }>();
      for (const t of valid) {
        const name = toTitleCase(t.name.trim());
        const relevance = Math.min(1, Math.max(0, t.relevance));
        const existing = deduped.get(name);
        if (!existing) deduped.set(name, { name, relevance });
        else if (relevance > existing.relevance) existing.relevance = relevance;
      }
      // 4. Sort descending and cap at 5
      result.topics = Array.from(deduped.values())
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 5);
    } else {
      result.topics = undefined;
    }

    return result;
  } catch {
    return {
      summary: completion,
      keyTakeaways: [],
      worthItScore: 5,
      worthItReason: "Unable to parse structured response",
      worthItDimensions: undefined,
    };
  }
}
