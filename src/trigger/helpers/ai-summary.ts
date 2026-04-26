import { generateCompletion } from "@/lib/ai";
import {
  parseJsonResponse,
  TOPIC_KINDS,
  type SummaryResult,
  type NormalizedCategory,
  type NormalizedTopic,
  type TopicKind,
} from "@/lib/openrouter";
import { WORTH_IT_SIGNAL_KEYS, SIGNAL_LABELS } from "@/lib/openrouter";
import { SYSTEM_PROMPT, getSummarizationPrompt } from "@/lib/prompts";
import { interpolatePrompt } from "@/lib/admin/prompt-utils";
import {
  computeSignalScore,
  coerceSignals,
  clampAdjustment,
  toSignalBoolean,
} from "@/lib/score-utils";
import { getCategoryBanlist } from "@/lib/category-banlist";
import { validateTopicLabel } from "@/lib/topic-label-validator";
import type {
  PodcastIndexPodcast,
  PodcastIndexEpisode,
} from "@/lib/podcastindex";

// File-private helper — not exported. If a second consumer appears, extract it then.
function toTitleCase(str: string): string {
  return str.replace(
    /\w\S*/g,
    (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
  );
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function coerceKind(v: unknown): TopicKind {
  return typeof v === "string" && (TOPIC_KINDS as readonly string[]).includes(v)
    ? (v as TopicKind)
    : "other";
}

function coerceAliases(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const MAX_CATEGORIES = 8; // upper bound from issue (3–8 items)
const MAX_TOPICS = 8;
const MAX_CONCEPT_TOPICS = 3; // safety net mirroring the prompt's concept cap

export type {
  SummaryResult,
  NormalizedCategory,
  NormalizedTopic,
} from "@/lib/openrouter";

/**
 * Normalize the raw `categories` field from the LLM response into a clean
 * NormalizedCategory[]. Filters non-object/non-string-name entries, drops
 * labels that fail validation (with a structured warning), title-cases names,
 * clamps relevance into [0,1], dedupes by normalized name (highest relevance
 * wins), sorts descending, caps at MAX_CATEGORIES.
 */
export function normalizeCategories(
  raw: unknown,
  banlist: readonly string[],
): NormalizedCategory[] {
  if (!Array.isArray(raw)) return [];
  const deduped = new Map<string, NormalizedCategory>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.name !== "string") continue;
    const trimmed = e.name.trim();
    const v = validateTopicLabel(trimmed, banlist);
    if (!v.ok) {
      console.warn(
        `[ai-summary] category dropped (${v.reason}): ${trimmed.slice(0, 40)}`,
      );
      continue;
    }
    const relevance =
      typeof e.relevance === "number" && !Number.isNaN(e.relevance)
        ? clamp01(e.relevance)
        : NaN;
    if (Number.isNaN(relevance)) continue;
    const name = toTitleCase(trimmed);
    const existing = deduped.get(name);
    if (!existing || relevance > existing.relevance) {
      deduped.set(name, { name, relevance });
    }
  }
  return Array.from(deduped.values())
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, MAX_CATEGORIES);
}

/**
 * Normalize the raw `topics` field from the LLM response into a clean
 * NormalizedTopic[]. Coerces unknown kinds to 'other', clamps relevance and
 * coverage_score to [0,1], maps snake_case `coverage_score` → camelCase
 * `coverageScore`, enforces the concept cap (3) and overall cap (8) as a
 * safety net behind the prompt-level instructions.
 */
export function normalizeTopics(
  raw: unknown,
  banlist: readonly string[],
): NormalizedTopic[] {
  if (!Array.isArray(raw)) return [];
  const out: NormalizedTopic[] = [];
  let conceptCount = 0;
  for (const entry of raw) {
    if (out.length >= MAX_TOPICS) break;
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.label !== "string") continue;
    const trimmed = e.label.trim();
    const v = validateTopicLabel(trimmed, banlist);
    if (!v.ok) {
      console.warn(
        `[ai-summary] topic dropped (${v.reason}): ${trimmed.slice(0, 40)}`,
      );
      continue;
    }
    const kind = coerceKind(e.kind);
    if (kind === "concept") {
      if (conceptCount >= MAX_CONCEPT_TOPICS) continue;
      conceptCount += 1;
    }
    out.push({
      label: trimmed,
      kind,
      summary: typeof e.summary === "string" ? e.summary.trim() : "",
      aliases: coerceAliases(e.aliases),
      ongoing: e.ongoing === true,
      relevance:
        typeof e.relevance === "number" && !Number.isNaN(e.relevance)
          ? clamp01(e.relevance)
          : 0,
      coverageScore:
        typeof e.coverage_score === "number" && !Number.isNaN(e.coverage_score)
          ? clamp01(e.coverage_score)
          : 0,
    });
  }
  return out;
}

export async function generateEpisodeSummary(
  podcast: PodcastIndexPodcast | undefined,
  episode: PodcastIndexEpisode,
  transcript: string,
  customPrompt?: string | null,
): Promise<SummaryResult> {
  // Banlist is fetched once per call. The module-scope cache (1h TTL) means
  // ingestion bursts share a single DB hit. Custom prompts don't need it,
  // but we still fetch — the cache amortizes it to ~free.
  const banlist = await getCategoryBanlist();

  const prompt = customPrompt
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
        transcript,
        banlist,
      );

  const completion = await generateCompletion([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ]);

  let raw: Record<string, unknown>;
  try {
    raw = parseJsonResponse<Record<string, unknown>>(completion);
  } catch {
    return {
      summary: completion,
      keyTakeaways: [],
      worthItScore: 5,
      worthItReason: "Unable to parse structured response",
      worthItDimensions: undefined,
    };
  }

  const result: SummaryResult = {
    summary: typeof raw.summary === "string" ? raw.summary : "",
    keyTakeaways: Array.isArray(raw.keyTakeaways)
      ? (raw.keyTakeaways as unknown[]).filter(
          (t): t is string => typeof t === "string",
        )
      : [],
    worthItScore: typeof raw.worthItScore === "number" ? raw.worthItScore : 5,
    worthItReason:
      typeof raw.worthItReason === "string" ? raw.worthItReason : "",
    worthItDimensions: undefined,
  };

  // Signal-based scoring (new format)
  const rawSignals = raw.worthItSignals;
  if (rawSignals && typeof rawSignals === "object") {
    const signalObj = rawSignals as Record<string, unknown>;
    // Warn on non-boolean signal values before coercion (skip missing keys to reduce noise)
    for (const key of WORTH_IT_SIGNAL_KEYS) {
      if (key in signalObj && typeof signalObj[key] !== "boolean") {
        console.warn(
          `[ai-summary] non-boolean signal coerced: ${key}=${signalObj[key]} → ${toSignalBoolean(signalObj[key])}`,
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
    const firedLabels = WORTH_IT_SIGNAL_KEYS.filter((k) => signals[k]).map(
      (k) => SIGNAL_LABELS[k].toLowerCase(),
    );
    const firedCount = firedLabels.length;
    const adjText =
      adjustment === 0
        ? `Adjustment: 0 (${adjustmentReason || "signals capture quality accurately"}).`
        : `Adjustment: ${adjustment > 0 ? "+1" : "-1"} (${adjustmentReason}).`;
    const signalSummary = `${firedCount}/8 signals: ${firedLabels.join(", ") || "none"}. ${adjText}`;
    const llmReason =
      typeof raw.worthItReason === "string" ? raw.worthItReason.trim() : "";
    result.worthItReason = llmReason
      ? `${llmReason} (${signalSummary})`
      : signalSummary;
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
      const computed = parseFloat(
        ((uniqueness + actionability + timeValue) / 3).toFixed(1),
      );
      if (result.worthItScore !== computed) {
        console.warn(
          `[ai-summary] worthItScore mismatch: LLM=${result.worthItScore}, computed=${computed}. Using computed value.`,
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

  // Independent failure handling for the two topic layers (load-bearing per
  // issue #381 and ADR-031). A parse failure in one normalizer must NOT
  // strand the other.
  try {
    result.categories = normalizeCategories(raw.categories, banlist);
  } catch (err) {
    console.warn(
      `[ai-summary] normalizeCategories failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    result.categories = undefined;
  }

  try {
    result.topics = normalizeTopics(raw.topics, banlist);
  } catch (err) {
    console.warn(
      `[ai-summary] normalizeTopics failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    result.topics = undefined;
  }

  return result;
}
