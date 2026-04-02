/**
 * Shared helpers for Worth It Score display.
 * Used by both SummaryDisplay (full card) and WorthItBadge (compact).
 */

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
