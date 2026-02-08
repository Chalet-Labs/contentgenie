import {
  generateCompletion,
  parseJsonResponse,
  type SummaryResult,
} from "@/lib/openrouter";
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
    return parseJsonResponse<SummaryResult>(completion);
  } catch {
    return {
      summary: completion,
      keyTakeaways: [],
      worthItScore: 5,
      worthItReason: "Unable to parse structured response",
    };
  }
}
