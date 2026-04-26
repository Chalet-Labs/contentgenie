// Validates topic/category labels emitted by the LLM before they reach DB writes
// or downstream resolution. Rejects empty/oversized labels, control characters,
// instruction-shaped strings (prompt-injection defence), and exact banlist
// matches (case-insensitive). Order matters: structural rejections (control
// chars, instruction shape) take precedence over banlist hits — see ADR-031
// rationale around graceful-degradation and the spec's R23 (prompt injection
// via transcript-derived labels).

export type LabelRejectReason =
  | "empty"
  | "too_long"
  | "control_chars"
  | "instruction_shaped"
  | "banlisted";

export type LabelValidationResult =
  | { ok: true }
  | { ok: false; reason: LabelRejectReason };

export const MAX_LABEL_LENGTH = 80;

const CONTROL_CHARS = /[\x00-\x1F\x7F]/;

const INSTRUCTION_MARKERS = [
  "system:",
  "assistant:",
  "user:",
  "</",
  "<|",
  "ignore previous",
  "ignore the above",
  "disregard",
  "###",
  "```",
] as const;

export function validateTopicLabel(
  label: string,
  banlist: readonly string[],
): LabelValidationResult {
  const trimmed = label.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };
  if (trimmed.length > MAX_LABEL_LENGTH)
    return { ok: false, reason: "too_long" };
  if (CONTROL_CHARS.test(label)) return { ok: false, reason: "control_chars" };

  const lower = trimmed.toLowerCase();
  if (INSTRUCTION_MARKERS.some((m) => lower.includes(m))) {
    return { ok: false, reason: "instruction_shaped" };
  }
  if (banlist.some((b) => b.trim().toLowerCase() === lower)) {
    return { ok: false, reason: "banlisted" };
  }
  return { ok: true };
}
