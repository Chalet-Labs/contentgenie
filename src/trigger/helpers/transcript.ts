import he from "he";
import type { PodcastIndexEpisode } from "@/lib/podcastindex";
import { safeFetch } from "@/lib/security";

const MAX_TRANSCRIPT_LENGTH = 50000;
const FETCH_TIMEOUT_MS = 30000;

const SUPPORTED_TRANSCRIPT_TYPES = [
  "text/plain",
  "application/srt",
  "text/vtt",
  "text/html",
] as const;

/**
 * Converts WebVTT content to plain text by removing all structural markup.
 */
export function stripVttTimestamps(raw: string): string {
  let text = raw;

  // Remove the WEBVTT header block (everything up to and including the first blank line)
  text = text.replace(/^WEBVTT[^\n]*\n(.*?\n)?\n/m, "");

  // Remove NOTE, STYLE, REGION blocks (keyword line plus any following non-blank lines)
  text = text.replace(/^(NOTE|STYLE|REGION)[^\n]*(\n[^\n]+)*/gm, "");

  // Remove cue timing lines (HH:MM:SS.mmm --> HH:MM:SS.mmm with optional settings)
  text = text.replace(
    /^\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}[^\n]*$/gm,
    ""
  );

  // Remove numeric-only cue identifiers (a line containing only digits)
  text = text.replace(/^\d+\s*$/gm, "");

  // Remove VTT timestamp tags: <HH:MM:SS.mmm> — must be before named tag removal
  text = text.replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, "");

  // Remove named inline tags: <v Name>, </v>, <c>, <b>, <i>, <u>, <ruby>, <rt>, <lang>, etc.
  text = text.replace(/<\/?(?:v|c|b|i|u|ruby|rt|lang)[^>]*>/g, "");

  // Collapse multiple blank lines to a single newline and trim
  text = text.replace(/\n{2,}/g, "\n").trim();

  return text;
}

/**
 * Extracts plain text from an HTML transcript page.
 */
export function stripHtmlTranscript(raw: string): string {
  // Remove <script> and <style> blocks including their content
  let text = raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode HTML entities
  text = he.decode(text);

  // Collapse whitespace
  text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  return text;
}

/**
 * Normalizes raw transcript content to plain text based on MIME type.
 * text/plain and application/srt pass through unchanged.
 */
export function normalizeTranscriptContent(raw: string, type: string): string {
  switch (type) {
    case "text/vtt":
      return stripVttTimestamps(raw);
    case "text/html":
      return stripHtmlTranscript(raw);
    case "application/srt":
    case "text/plain":
    default:
      return raw;
  }
}

export async function fetchTranscript(
  episode: Pick<PodcastIndexEpisode, "transcripts">
): Promise<string | undefined> {
  if (!episode.transcripts || episode.transcripts.length === 0) {
    return undefined;
  }

  // Pick the best available transcript using priority order.
  // text/plain needs no processing; application/srt is mostly text;
  // text/vtt needs timestamp stripping; text/html needs tag removal.
  const transcriptEntry = SUPPORTED_TRANSCRIPT_TYPES
    .map((type) => episode.transcripts.find((t) => t.type === type))
    .find((entry) => entry?.url);

  if (!transcriptEntry?.url) {
    return undefined;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let transcript: string;
  try {
    transcript = await safeFetch(transcriptEntry.url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  transcript = normalizeTranscriptContent(transcript, transcriptEntry.type);
  transcript = transcript.trim();
  if (!transcript) {
    return undefined;
  }
  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    transcript =
      transcript.slice(0, MAX_TRANSCRIPT_LENGTH) + "\n\n[Transcript truncated...]";
  }

  return transcript;
}

/**
 * Extracts a transcript URL from an episode description.
 * Looks for patterns like "Transcript: https://..." in the text.
 */
export function extractTranscriptUrl(description: string): string | null {
  if (!description) return null;

  // Extract URLs from anchor tags where the link text mentions "transcript" — must run
  // before HTML stripping, which would otherwise destroy the href attribute value.
  const anchorMatch = description.match(
    /<a\s[^>]*href=["']?(https?:\/\/[^"'\s>]+)["']?[^>]*>[^<]*transcripts?[^<]*<\/a>/i
  );
  if (anchorMatch?.[1]) {
    return anchorMatch[1].replace(/[).,;:]+$/, "");
  }

  // Strip HTML tags and decode all HTML entities
  const text = description.replace(/<[^>]+>/g, " ");
  const decoded = he.decode(text);

  // Match transcript URL patterns
  const match = decoded.match(
    /(?:full\s+)?transcripts?(?:\s+available)?[\s:]+\n?\s*(https?:\/\/\S+)/i
  );

  if (!match?.[1]) return null;

  // Clean trailing punctuation from URL
  return match[1].replace(/[).,;:]+$/, "");
}

/**
 * Fetches transcript content from a URL using SSRF-safe fetching.
 * Returns undefined on any error (non-fatal fallback).
 */
export async function fetchTranscriptFromUrl(
  url: string
): Promise<string | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let content = await safeFetch(url, { signal: controller.signal });

    // Strip HTML if content appears to be an HTML page
    if (/<html[\s>]/i.test(content) || /<!doctype\s+html/i.test(content)) {
      content = content.replace(/<[^>]+>/g, " ");
    }

    content = content.trim();
    if (!content) return undefined;

    if (content.length > MAX_TRANSCRIPT_LENGTH) {
      content =
        content.slice(0, MAX_TRANSCRIPT_LENGTH) + "\n\n[Transcript truncated...]";
    }

    return content;
  } finally {
    clearTimeout(timeout);
  }
}
