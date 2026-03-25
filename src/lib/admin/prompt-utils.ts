export interface PromptVars {
  title: string;
  podcastName: string;
  description: string;
  duration: number; // in seconds
  transcript: string;
}

/**
 * Interpolates a prompt template by replacing known placeholders with episode data.
 * Unrecognized {{x}} tokens pass through unchanged.
 */
export function interpolatePrompt(template: string, vars: PromptVars): string {
  const durationMinutes = vars.duration > 0 ? Math.round(vars.duration / 60) : 0;

  return template
    .replace(/\{\{title\}\}/g, vars.title)
    .replace(/\{\{podcastName\}\}/g, vars.podcastName)
    .replace(/\{\{description\}\}/g, vars.description)
    .replace(/\{\{duration\}\}/g, String(durationMinutes))
    .replace(/\{\{transcript\}\}/g, vars.transcript);
}
