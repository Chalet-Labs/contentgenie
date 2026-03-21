/**
 * Steps emitted by summarize-episode via metadata.set("step", ...).
 * Shared between the task (producer) and summary-display UI (consumer)
 * to prevent unsound `as` casts from diverging.
 */
export const SUMMARIZATION_STEPS = [
  "fetching-episode",
  "fetching-podcast",
  "generating-summary",
  "saving-results",
  "completed",
] as const;

export type SummarizationStep = (typeof SUMMARIZATION_STEPS)[number];
