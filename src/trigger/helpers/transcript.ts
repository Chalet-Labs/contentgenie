import he from "he";
import type { PodcastIndexEpisode } from "@/lib/podcastindex";
import { safeFetch } from "@/lib/security";

const MAX_TRANSCRIPT_LENGTH = 50000;
const FETCH_TIMEOUT_MS = 30000;

export async function fetchTranscript(
  episode: PodcastIndexEpisode
): Promise<string | undefined> {
  if (!episode.transcripts || episode.transcripts.length === 0) {
    return undefined;
  }

  const transcriptEntry = episode.transcripts.find(
    (t) => t.type === "text/plain" || t.type === "application/srt"
  );

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
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
