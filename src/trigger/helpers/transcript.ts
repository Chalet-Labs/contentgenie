import type { PodcastIndexEpisode } from "@/lib/podcastindex";

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

  let response: Response;
  try {
    response = await fetch(transcriptEntry.url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(
      `Transcript fetch failed: ${response.status} ${response.statusText}`
    );
  }

  let transcript = await response.text();
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
