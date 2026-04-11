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
      result.topics = result.topics
        // 1. Array shape check: drop entries missing name or relevance
        .filter(
          (t): t is { name: string; relevance: number } =>
            typeof t === "object" &&
            t !== null &&
            typeof t.name === "string" &&
            t.name.trim().length > 0 &&
            typeof t.relevance === "number"
        )
        // 2. Normalize: title-case name, clamp relevance to [0, 1]
        .map((t) => ({
          name: toTitleCase(t.name.trim()),
          relevance: Math.min(1, Math.max(0, t.relevance)),
        }))
        // 3. Deduplicate by normalized name (keep highest relevance)
        // case-insensitivity is provided by toTitleCase() above, not by this comparison
        .reduce<Array<{ name: string; relevance: number }>>((acc, t) => {
          const existing = acc.find((x) => x.name === t.name);
          if (!existing) acc.push(t);
          else if (t.relevance > existing.relevance) existing.relevance = t.relevance;
          return acc;
        }, [])
        // 4. Sort descending and cap at 5
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
