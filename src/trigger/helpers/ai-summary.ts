import { generateCompletion } from "@/lib/ai";
import { parseJsonResponse, type SummaryResult } from "@/lib/openrouter";
import { SYSTEM_PROMPT, getSummarizationPrompt } from "@/lib/prompts";
import type { PodcastIndexPodcast, PodcastIndexEpisode } from "@/lib/podcastindex";

export type { SummaryResult } from "@/lib/openrouter";

export async function generateEpisodeSummary(
  podcast: PodcastIndexPodcast | undefined,
  episode: PodcastIndexEpisode,
  transcript?: string
): Promise<SummaryResult> {
  const prompt = getSummarizationPrompt(
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
