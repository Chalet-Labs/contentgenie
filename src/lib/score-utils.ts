/**
 * Shared helpers for Worth It Score display.
 * Used by both SummaryDisplay (full card) and WorthItBadge (compact).
 */

export function getScoreColor(score: number): string {
  if (score >= 8) return "bg-score-exceptional";
  if (score >= 6) return "bg-score-above";
  if (score >= 4) return "bg-score-average";
  if (score >= 2) return "bg-score-below";
  return "bg-score-skip";
}

export function getScoreLabel(score: number): string {
  if (score >= 8) return "Exceptional";
  if (score >= 6) return "Above Average";
  if (score >= 4) return "Average";
  if (score >= 2) return "Below Average";
  return "Skip";
}
