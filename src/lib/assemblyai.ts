const API_BASE_URL = "https://api.assemblyai.com/v2";

const DEFAULT_POLL_INTERVAL_MS = 5000;
const MAX_WAIT_MS = 30 * 60 * 1000; // 30 minutes
const BACKOFF_FACTOR = 1.5;
const MAX_POLL_INTERVAL_MS = 30000;

// Read env var at runtime, not module load time (Next.js bundling issue)
function getApiKey(): string {
  return process.env.ASSEMBLYAI_API_KEY || "";
}

function getAuthHeaders(): Record<string, string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("AssemblyAI API key is not configured");
  }
  return {
    Authorization: apiKey,
    "Content-Type": "application/json",
  };
}

// Types for AssemblyAI API responses
export type TranscriptionStatus =
  | "queued"
  | "processing"
  | "completed"
  | "error";

export interface TranscriptionResult {
  id: string;
  status: TranscriptionStatus;
  text: string | null;
  error: string | null;
}

export interface TranscribeOptions {
  pollIntervalMs?: number;
  maxWaitMs?: number;
}

// Submit an audio URL for transcription, returns the transcript ID
export async function submitTranscription(audioUrl: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/transcript`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ audio_url: audioUrl }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `AssemblyAI API error: ${response.status} - ${errorText}`
    );
  }

  const data = await response.json();
  if (typeof data?.id !== "string" || !data.id) {
    throw new Error(
      "AssemblyAI API error: submit response did not include a transcript ID"
    );
  }
  return data.id;
}

// Get the current status of a transcription
export async function getTranscriptionStatus(
  transcriptId: string
): Promise<TranscriptionResult> {
  const response = await fetch(`${API_BASE_URL}/transcript/${transcriptId}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `AssemblyAI API error: ${response.status} - ${errorText}`
    );
  }

  const data = await response.json();
  if (typeof data?.id !== "string" || typeof data?.status !== "string") {
    throw new Error(
      "AssemblyAI API error: invalid response from status check"
    );
  }
  return {
    id: data.id,
    status: data.status as TranscriptionStatus,
    text: data.text ?? null,
    error: data.error ?? null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// High-level function: submit audio and poll until completion or error
export async function transcribeAudio(
  audioUrl: string,
  options: TranscribeOptions = {}
): Promise<TranscriptionResult> {
  const pollInterval = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxWait = options.maxWaitMs ?? MAX_WAIT_MS;

  const transcriptId = await submitTranscription(audioUrl);

  let elapsed = 0;
  let currentInterval = pollInterval;

  while (elapsed < maxWait) {
    await sleep(currentInterval);
    elapsed += currentInterval;

    const result = await getTranscriptionStatus(transcriptId);

    if (result.status === "completed" || result.status === "error") {
      return result;
    }

    // Exponential backoff
    currentInterval = Math.min(
      currentInterval * BACKOFF_FACTOR,
      MAX_POLL_INTERVAL_MS
    );
  }

  throw new Error(`Transcription timed out after ${maxWait}ms`);
}
