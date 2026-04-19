import { generateCompletion } from "@/lib/ai";
import { parseJsonResponse, type SummaryResult } from "@/lib/openrouter";
import { WORTH_IT_SIGNAL_KEYS, SIGNAL_LABELS } from "@/lib/openrouter";
import { SYSTEM_PROMPT, getSummarizationPrompt } from "@/lib/prompts";
import { interpolatePrompt } from "@/lib/admin/prompt-utils";
import { computeSignalScore, coerceSignals, clampAdjustment, toSignalBoolean } from "@/lib/score-utils";
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
    const raw = parseJsonResponse<Record<string, unknown>>(completion);
    const result = raw as unknown as SummaryResult;

    // Signal-based scoring (new format)
    const rawSignals = raw.worthItSignals;
    if (rawSignals && typeof rawSignals === "object") {
      const signalObj = rawSignals as Record<string, unknown>;
      // Warn on non-boolean signal values before coercion (skip missing keys to reduce noise)
      for (const key of WORTH_IT_SIGNAL_KEYS) {
        if (key in signalObj && typeof signalObj[key] !== "boolean") {
          console.warn(
            `[ai-summary] non-boolean signal coerced: ${key}=${signalObj[key]} → ${toSignalBoolean(signalObj[key])}`
          );
        }
      }
      const signals = coerceSignals(signalObj);
      const adjustment = clampAdjustment(raw.worthItAdjustment);
      const adjustmentReason =
        typeof raw.worthItAdjustmentReason === "string"
          ? raw.worthItAdjustmentReason
          : "";

      result.worthItScore = computeSignalScore(signals, adjustment);
      result.worthItDimensions = {
        kind: "signals",
        signals,
        adjustment,
        adjustmentReason,
      };

      // Build a compact worthItReason from fired signals
      const firedLabels = WORTH_IT_SIGNAL_KEYS
        .filter((k) => signals[k])
        .map((k) => SIGNAL_LABELS[k].toLowerCase());
      const firedCount = firedLabels.length;
      const adjText =
        adjustment === 0
          ? `Adjustment: 0 (${adjustmentReason || "signals capture quality accurately"}).`
          : `Adjustment: ${adjustment > 0 ? "+1" : "-1"} (${adjustmentReason}).`;
      const signalSummary = `${firedCount}/8 signals: ${firedLabels.join(", ") || "none"}. ${adjText}`;
      const llmReason = typeof raw.worthItReason === "string" ? raw.worthItReason.trim() : "";
      result.worthItReason = llmReason ? `${llmReason} (${signalSummary})` : signalSummary;
    }
    // Legacy dimension-averaging (backward compat for custom prompts)
    else if (raw.worthItDimensions && typeof raw.worthItDimensions === "object") {
      const dims = raw.worthItDimensions as Record<string, unknown>;
      if (
        typeof dims.uniqueness === "number" &&
        typeof dims.actionability === "number" &&
        typeof dims.timeValue === "number"
      ) {
        const { uniqueness, actionability, timeValue } = dims;
        const computed = parseFloat(((uniqueness + actionability + timeValue) / 3).toFixed(1));
        if (result.worthItScore !== computed) {
          console.warn(
            `[ai-summary] worthItScore mismatch: LLM=${result.worthItScore}, computed=${computed}. Using computed value.`
          );
        }
        result.worthItScore = computed;
        result.worthItDimensions = {
          kind: "dimensions",
          uniqueness,
          actionability,
          timeValue,
        };
      }
    }
    // Neither format (custom prompt returning raw score) — keep as-is, default if missing
    if (typeof result.worthItScore !== "number") {
      result.worthItScore = 5;
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
