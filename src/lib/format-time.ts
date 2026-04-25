/**
 * Format seconds as `M:SS` or `H:MM:SS` when hours are non-zero
 * (e.g. 65 → "1:05", 3725 → "1:02:05"). Returns "0:00" for non-finite,
 * non-positive, or sub-second input.
 */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const secsPad = secs.toString().padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secsPad}`;
  }
  return `${mins}:${secsPad}`;
}
