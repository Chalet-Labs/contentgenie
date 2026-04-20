import type { WorthItSignals } from "@/lib/openrouter";
import { WORTH_IT_SIGNAL_KEYS } from "@/lib/openrouter";

export type ScoreBand = "exceptional" | "above" | "average" | "below" | "skip";

export type ScoreLabel =
  | "Exceptional"
  | "Above Average"
  | "Average"
  | "Below Average"
  | "Skip";

const BAND_LABEL: Record<ScoreBand, ScoreLabel> = {
  exceptional: "Exceptional",
  above: "Above Average",
  average: "Average",
  below: "Below Average",
  skip: "Skip",
};

const BAND_COLOR_CLASS: Record<ScoreBand, string> = {
  exceptional: "bg-score-exceptional text-score-exceptional-foreground",
  above: "bg-score-above text-score-above-foreground",
  average: "bg-score-average text-score-average-foreground",
  below: "bg-score-below text-score-below-foreground",
  skip: "bg-score-skip text-score-skip-foreground",
};

export function getScoreBand(score: number): ScoreBand {
  if (score >= 8) return "exceptional";
  if (score >= 6) return "above";
  if (score >= 4) return "average";
  if (score >= 2) return "below";
  return "skip";
}

export function getScoreLabel(score: number): ScoreLabel {
  return BAND_LABEL[getScoreBand(score)];
}

export function getScoreColor(score: number): string {
  return BAND_COLOR_CLASS[getScoreBand(score)];
}

/** Clamp a raw adjustment value to -1 | 0 | 1. Non-numbers and NaN → 0. */
export function clampAdjustment(raw: unknown): -1 | 0 | 1 {
  if (typeof raw !== "number" || Number.isNaN(raw)) return 0;
  if (raw < -1) return -1;
  if (raw > 1) return 1;
  return Math.round(raw) as -1 | 0 | 1;
}

/** Safely coerce an unknown value to boolean. Handles string "true"/"false" and numeric 0/1. */
export function toSignalBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  if (typeof value === "number") return value === 1;
  return false;
}

/** Coerce a raw object into a valid WorthItSignals. Missing keys → false. */
export function coerceSignals(raw: Record<string, unknown>): WorthItSignals {
  return {
    hasActionableInsights: toSignalBoolean(raw.hasActionableInsights),
    hasNearTermApplicability: toSignalBoolean(raw.hasNearTermApplicability),
    staysFocused: toSignalBoolean(raw.staysFocused),
    goesBeyondSurface: toSignalBoolean(raw.goesBeyondSurface),
    isWellStructured: toSignalBoolean(raw.isWellStructured),
    timeJustified: toSignalBoolean(raw.timeJustified),
    hasConcreteExamples: toSignalBoolean(raw.hasConcreteExamples),
    hasExpertPerspectives: toSignalBoolean(raw.hasExpertPerspectives),
  };
}

/**
 * Converts a Drizzle decimal string to a number.
 * Returns 0 for null, empty string, or non-numeric values.
 */
export function parseScore(raw: string | null): number {
  if (raw === null || raw === "") return 0;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Compute the worth-it score from boolean signals + adjustment. Range: [1, 10]. */
export function computeSignalScore(signals: WorthItSignals, adjustment: number): number {
  const trueCount = WORTH_IT_SIGNAL_KEYS.filter((k) => signals[k]).length;
  const base = 1 + trueCount;
  const clampedAdj = clampAdjustment(adjustment);
  return Math.min(10, Math.max(1, base + clampedAdj));
}
