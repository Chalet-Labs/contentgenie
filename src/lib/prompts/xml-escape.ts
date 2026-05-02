/**
 * Shared XML-escape helper for prompt payload interpolation.
 *
 * Used by prompt builders that interpolate user-controlled strings into an
 * XML-shaped LLM payload (server-side string templating only — NOT HTML/DOM
 * output). Centralizing here keeps the rule set consistent across prompts and
 * avoids byte-identical copies in sibling modules.
 */

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch] ?? ch);
}
