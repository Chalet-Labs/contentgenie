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

const LOG_PREFIX = "[ai-summary]";
export const MAX_CATEGORIES = 8;
export const MAX_TOPICS = 8;
export const MAX_CONCEPT_TOPICS = 3; // safety net mirroring the prompt's concept cap

// Legacy custom prompts (prior to dual-layer split) emit broad tags as
// `topics: [{ name, relevance }]`. The new prompt asks for `categories` in
// that slot. Detect the legacy shape so we don't strand custom-prompt
// installations with zero persisted broad tags.
//
// `some` (not `every`) is intentional — partial-acceptance per Codex P1 review.
// A single malformed entry (bad `relevance` value, missing `name`) shouldn't
// drop the entire fallback; `normalizeCategories` already filters non-`name`
// entries. Trade-off: a custom prompt that emits a mixed bag of legacy tags
// AND new canonical-topic objects in the same `topics` array will lose the
// canonical-topic side (folded as legacy). That mixed-shape case is contrived;
// the common case (one bad entry in an otherwise-legacy array) wins.
function looksLikeLegacyCategoriesArray(v: unknown): boolean {
  if (!Array.isArray(v) || v.length === 0) return false;
  return v.some(
    (e) =>
      e !== null &&
      typeof e === "object" &&
      typeof (e as Record<string, unknown>).name === "string" &&
      typeof (e as Record<string, unknown>).relevance === "number",
  );
}

export type {
  SummaryResult,
  NormalizedCategory,
  NormalizedTopic,
} from "@/lib/openrouter";

/**
 * Highest-relevance-wins dedup is intentional: re-summarization sometimes
 * returns the same name with a downgraded relevance, and we keep the strongest
 * signal so `episode_topics.relevance` ranking stays stable across re-runs.
 *
 * Categories are NOT filtered by the category banlist — categories ARE the
 * banlist's source population. The banlist exists to keep canonical-topic
 * candidates from collapsing onto broad tags; applying it here would silently
 * strip the most popular tags ("AI & Machine Learning" et al) from new
 * episodes. Structural rejections (empty / too long / control chars /
 * instruction-shaped) still apply.
 */
export function normalizeCategories(raw: unknown): NormalizedCategory[] {
  if (!Array.isArray(raw)) return [];
  const deduped = new Map<string, NormalizedCategory>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.name !== "string") continue;
    // Validate the raw label so the validator's CONTROL_CHARS check sees any
    // leading/trailing control chars (`\n`, `\t`, etc.). Trimming before
    // validation would silently strip them and bypass that guard.
    const v = validateTopicLabel(e.name, []);
    if (!v.ok) {
      console.warn(
        `${LOG_PREFIX} category dropped (${v.reason}): ${e.name.slice(0, 40)}`,
      );
      continue;
    }
    const relevance =
      typeof e.relevance === "number" && !Number.isNaN(e.relevance)
        ? clamp01(e.relevance)
        : NaN;
    if (Number.isNaN(relevance)) continue;
    const name = toTitleCase(e.name.trim());
    const existing = deduped.get(name);
    if (!existing || relevance > existing.relevance) {
      deduped.set(name, { name, relevance });
    }
  }
  return Array.from(deduped.values())
    .sort((a, b) => b.relevance - a.relevance || a.name.localeCompare(b.name))
    .slice(0, MAX_CATEGORIES);
}

/**
 * Maps snake_case `coverage_score` → camelCase `coverageScore` (the wire
 * format from the LLM uses snake_case to match the spec). The concept cap
 * (3) and overall cap (8) are enforced here as a safety net behind the
 * prompt-level instructions — the prompt may drift but the cap stays.
 *
 * NOTE: `summary` and `aliases` are NOT routed through `validateTopicLabel`;
 * only `.trim()`. Downstream consumers (entity-resolution module, A4) must
 * treat them as untrusted strings.
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
    // Validate the raw label so the validator's CONTROL_CHARS check sees any
    // leading/trailing control chars (`\n`, `\t`, etc.). Trimming before
    // validation would silently strip them and bypass that guard.
    const v = validateTopicLabel(e.label, banlist);
    if (!v.ok) {
      console.warn(
        `${LOG_PREFIX} topic dropped (${v.reason}): ${e.label.slice(0, 40)}`,
      );
      continue;
    }
    const kind = coerceKind(e.kind);
    if (kind === "concept") {
      if (conceptCount >= MAX_CONCEPT_TOPICS) continue;
      conceptCount += 1;
    }
    out.push({
      label: e.label.trim(),
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
  // warm-cache cost is ~free; cold start pays one extra DB round-trip per
  // worker instance. Used by both the prompt (forbidden topic labels) and
  // the post-LLM `normalizeTopics` validator (drops banlisted candidates),
  // so the fetch is load-bearing on both prompt branches.
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

  // Only the JSON parse itself falls back to the unparsed-summary envelope;
  // downstream signal coercion and the two normalizer try/catches handle
  // their own failures so we don't lose partial structured output.
  // `parseJsonResponse` returns any valid JSON, including primitives and
  // `null` — guard for non-object before dereferencing summary fields below
  // so a `JSON null` payload doesn't TypeError on `raw.summary`.
  let raw: Record<string, unknown>;
  try {
    const parsed = parseJsonResponse<unknown>(completion);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Parsed payload is not a JSON object");
    }
    raw = parsed as Record<string, unknown>;
    // Treat a missing or blank `summary` as a structured-response failure.
    // Otherwise the episode would persist as `summaryStatus='completed'`
    // with an empty body — better to fall back to the unparsed-completion
    // envelope so the user sees the raw model output (or trip the upstream
    // retry path) than to ship a blank "completed" summary.
    if (typeof raw.summary !== "string" || raw.summary.trim().length === 0) {
      throw new Error("Parsed payload missing required `summary` field");
    }
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
          `${LOG_PREFIX} non-boolean signal coerced: ${key}=${signalObj[key]} → ${toSignalBoolean(signalObj[key])}`,
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
          `${LOG_PREFIX} worthItScore mismatch: LLM=${result.worthItScore}, computed=${computed}. Using computed value.`,
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
  // Independent try/catch per topic layer — if the categories layer parse
  // throws, the canonical-topics layer must still ship (and vice versa).
  // They feed independent downstream consumers (broad-tag UI ranking vs.
  // entity-resolution candidates) so neither failure should strand the other.
  // Mirrors ADR-031's "summary persists even when topics fail" principle.
  //
  // Custom prompts (which bypass `getSummarizationPrompt`) emit the legacy
  // shape `topics: [{ name, relevance }]` for broad tags. If `categories` is
  // absent and `topics` looks legacy, fold it into the categories layer so
  // custom-prompt installations don't lose their `episode_topics` rows.
  let categoriesRaw: unknown;
  let topicsRaw: unknown;
  let categoriesAccessFailed = false;
  let topicsAccessFailed = false;
  try {
    categoriesRaw = raw.categories;
  } catch (err) {
    categoriesAccessFailed = true;
    console.warn(
      `${LOG_PREFIX} normalizeCategories failed: raw.categories access threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    topicsRaw = raw.topics;
  } catch (err) {
    topicsAccessFailed = true;
    console.warn(
      `${LOG_PREFIX} normalizeTopics failed: raw.topics access threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  // Precedence: when `categories` is a usable array (even if empty? no — see
  // below), the new field wins. Fall back to the legacy `topics` shape when
  // `categoriesRaw` is missing, null, OR malformed (string, object, primitive,
  // empty array). A custom prompt that emits `"categories": "..."` would
  // otherwise leave us with zero persisted broad tags even when `topics`
  // contains valid legacy `{name, relevance}` entries — which is the
  // pre-refactor regression Codex P1 flagged.
  const categoriesIsUsableArray =
    Array.isArray(categoriesRaw) && (categoriesRaw as unknown[]).length > 0;
  const useLegacyShape =
    !categoriesIsUsableArray && looksLikeLegacyCategoriesArray(topicsRaw);

  if (categoriesAccessFailed) {
    result.categories = undefined;
  } else {
    try {
      result.categories = normalizeCategories(
        useLegacyShape ? topicsRaw : categoriesRaw,
      );
    } catch (err) {
      console.warn(
        `${LOG_PREFIX} normalizeCategories failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      result.categories = undefined;
    }
  }

  if (topicsAccessFailed) {
    result.topics = undefined;
  } else {
    try {
      // If we just folded `raw.topics` into categories above, skip canonical
      // normalization for that same payload — a legacy `{name, relevance}`
      // entry would always fail the `label` check anyway.
      result.topics = normalizeTopics(
        useLegacyShape ? undefined : topicsRaw,
        banlist,
      );
    } catch (err) {
      console.warn(
        `${LOG_PREFIX} normalizeTopics failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      result.topics = undefined;
    }
  }

  return result;
}
