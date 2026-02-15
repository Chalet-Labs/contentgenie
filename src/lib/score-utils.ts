/**
 * Shared helpers for Worth It Score display.
 * Used by both SummaryDisplay (full card) and WorthItBadge (compact).
 */

export function getScoreColor(score: number): string {
  if (score >= 8) return "bg-green-500";
  if (score >= 6) return "bg-emerald-500";
  if (score >= 4) return "bg-yellow-500";
  if (score >= 2) return "bg-orange-500";
  return "bg-red-500";
}

export function getScoreLabel(score: number): string {
  if (score >= 8) return "Highly Recommended";
  if (score >= 6) return "Worth Your Time";
  if (score >= 4) return "Decent";
  if (score >= 2) return "Skip Unless Interested";
  return "Not Recommended";
}
