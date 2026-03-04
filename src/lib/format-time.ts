/** Format seconds as M:SS (e.g. 65 → "1:05"). Returns "0:00" for non-finite input. */
export function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00"
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}
