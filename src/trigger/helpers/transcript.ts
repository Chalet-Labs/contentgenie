import he from "he";
import type { PodcastIndexEpisode } from "@/lib/podcastindex";
import { safeFetch } from "@/lib/security";

export const MAX_TRANSCRIPT_LENGTH = 50000;
export const FETCH_TIMEOUT_MS = 30000;
export const TRUNCATED_MARKER = "\n\n[Transcript truncated...]";

export async function safeFetchWithTimeout(
  url: string,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await safeFetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function truncateTranscript(text: string): string {
  if (text.length <= MAX_TRANSCRIPT_LENGTH) return text;
  let truncated = text.slice(0, MAX_TRANSCRIPT_LENGTH);
  if (/[\uD800-\uDBFF]$/.test(truncated)) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + TRUNCATED_MARKER;
}

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

  text = text.replace(/^WEBVTT[^\n]*\n([^\n]+\n)*\n/m, "");
  text = text.replace(/^(?:NOTE|STYLE|REGION)[^\n]*(?:\n[^\n]+)*/gm, "");
  // Cue IDs must be removed before timing lines — the lookahead needs the timing line present
  text = text.replace(
    /^\d+\s*$(?=\n(?:\d{2}:)?\d{2}:\d{2}\.\d{3}\s+-->)/gm,
    "",
  );
  text = text.replace(
    /^(?:\d{2}:)?\d{2}:\d{2}\.\d{3}\s+-->\s+(?:\d{2}:)?\d{2}:\d{2}\.\d{3}[^\n]*$/gm,
    "",
  );

  // Timestamp tags must be removed before named tags to avoid partial matches
  text = text.replace(/<(?:\d{2}:)?\d{2}:\d{2}\.\d{3}>/g, "");
  // Loop handles nested brackets (e.g. <<iframe>) that survive a single pass
  let prev;
  do {
    prev = text;
    text = text.replace(/<[^>]*>/g, "");
  } while (text !== prev);

  text = text.replace(/\n{2,}/g, "\n").trim();

  return text;
}

/**
 * Extracts plain text from an HTML transcript page.
 */
export function stripHtmlTranscript(raw: string): string {
  let text = raw.replace(/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi, " ");
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = he.decode(text);
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

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
  episode: Pick<PodcastIndexEpisode, "transcripts">,
): Promise<string | undefined> {
  if (!episode.transcripts || episode.transcripts.length === 0) {
    return undefined;
  }

  // Priority: least processing needed → most processing needed
  const transcriptEntry = SUPPORTED_TRANSCRIPT_TYPES.map((type) =>
    episode.transcripts.find((t) => t.type === type && t.url),
  ).find((entry) => entry != null);

  if (!transcriptEntry?.url) {
    return undefined;
  }

  let transcript = await safeFetchWithTimeout(transcriptEntry.url);

  const rawLength = transcript.length;
  transcript = normalizeTranscriptContent(transcript, transcriptEntry.type);
  transcript = transcript.trim();
  if (!transcript) {
    if (rawLength > 0) {
      console.warn("[fetchTranscript] Normalization produced empty output", {
        rawLength,
        type: transcriptEntry.type,
        url: transcriptEntry.url,
      });
    }
    return undefined;
  }
  return truncateTranscript(transcript);
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
    /<a\s[^>]*href=["']?(https?:\/\/[^"'\s>]+)["']?[^>]*>[^<]*transcripts?[^<]*<\/a>/i,
  );
  if (anchorMatch?.[1]) {
    return anchorMatch[1].replace(/[).,;:]+$/, "");
  }

  const text = description.replace(/<[^>]+>/g, " ");
  const decoded = he.decode(text);

  const match = decoded.match(
    /(?:full\s+)?transcripts?(?:\s+available)?[\s:]+\n?\s*(https?:\/\/\S+)/i,
  );

  if (!match?.[1]) return null;
  return match[1].replace(/[).,;:]+$/, "");
}

/**
 * Fetches transcript content from a URL using SSRF-safe fetching.
 * Throws on fetch errors; returns undefined only for empty or whitespace-only content.
 */
export async function fetchTranscriptFromUrl(
  url: string,
): Promise<string | undefined> {
  let content = await safeFetchWithTimeout(url);

  if (/<html[\s>]/i.test(content) || /<!doctype\s+html/i.test(content)) {
    content = stripHtmlTranscript(content);
  }

  content = content.trim();
  if (!content) return undefined;

  return truncateTranscript(content);
}
