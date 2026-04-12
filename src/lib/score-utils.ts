/**
 * Shared helpers for Worth It Score display.
 * Used by both SummaryDisplay (full card) and WorthItBadge (compact).
 */

import type { WorthItSignals } from "@/lib/openrouter";
import { WORTH_IT_SIGNAL_KEYS } from "@/lib/openrouter";

export function getScoreColor(score: number): string {
  if (score >= 8) return "bg-score-exceptional text-score-exceptional-foreground";
  if (score >= 6) return "bg-score-above text-score-above-foreground";
  if (score >= 4) return "bg-score-average text-score-average-foreground";
  if (score >= 2) return "bg-score-below text-score-below-foreground";
  return "bg-score-skip text-score-skip-foreground";
}

export function getScoreLabel(score: number): string {
  if (score >= 8) return "Exceptional";
  if (score >= 6) return "Above Average";
  if (score >= 4) return "Average";
  if (score >= 2) return "Below Average";
  return "Skip";
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

/** Compute the worth-it score from boolean signals + adjustment. Range: [1, 10]. */
export function computeSignalScore(signals: WorthItSignals, adjustment: number): number {
  const trueCount = WORTH_IT_SIGNAL_KEYS.filter((k) => signals[k]).length;
  const base = 1 + trueCount;
  const clampedAdj = clampAdjustment(adjustment);
  return Math.min(10, Math.max(1, base + clampedAdj));
}
