import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  submitTranscription,
  getTranscriptionStatus,
  transcribeAudio,
} from "@/lib/assemblyai";

describe("submitTranscription", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("throws when API key is missing", async () => {
    vi.stubEnv("ASSEMBLYAI_API_KEY", "");
    await expect(
      submitTranscription("https://example.com/audio.mp3")
    ).rejects.toThrow("AssemblyAI API key is not configured");
  });

  it("sends correct headers and body, returns transcript ID", async () => {
    vi.stubEnv("ASSEMBLYAI_API_KEY", "test-api-key");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "transcript-123", status: "queued" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await submitTranscription("https://example.com/audio.mp3");

    expect(result).toBe("transcript-123");
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.assemblyai.com/v2/transcript");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("test-api-key");
    expect(options.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(options.body);
    expect(body.audio_url).toBe("https://example.com/audio.mp3");
  });

  it("throws on non-ok response", async () => {
    vi.stubEnv("ASSEMBLYAI_API_KEY", "test-api-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      })
    );

    await expect(
      submitTranscription("https://example.com/audio.mp3")
    ).rejects.toThrow("AssemblyAI API error: 401 - Unauthorized");
  });

  it("throws when response is missing transcript ID", async () => {
    vi.stubEnv("ASSEMBLYAI_API_KEY", "test-api-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: "queued" }),
      })
    );

    await expect(
      submitTranscription("https://example.com/audio.mp3")
    ).rejects.toThrow(
      "AssemblyAI API error: submit response did not include a transcript ID"
    );
  });
});

describe("getTranscriptionStatus", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns result for completed transcript", async () => {
    vi.stubEnv("ASSEMBLYAI_API_KEY", "test-api-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "transcript-123",
            status: "completed",
            text: "Hello world",
            error: null,
          }),
      })
    );

    const result = await getTranscriptionStatus("transcript-123");

    expect(result).toEqual({
      id: "transcript-123",
      status: "completed",
      text: "Hello world",
      error: null,
    });
  });

  it("returns result with error for failed transcript", async () => {
    vi.stubEnv("ASSEMBLYAI_API_KEY", "test-api-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "transcript-456",
            status: "error",
            text: null,
            error: "Download error",
          }),
      })
    );

    const result = await getTranscriptionStatus("transcript-456");

    expect(result).toEqual({
      id: "transcript-456",
      status: "error",
      text: null,
      error: "Download error",
    });
  });

  it("throws on non-ok response", async () => {
    vi.stubEnv("ASSEMBLYAI_API_KEY", "test-api-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Not found"),
      })
    );

    await expect(getTranscriptionStatus("bad-id")).rejects.toThrow(
      "AssemblyAI API error: 404 - Not found"
    );
  });

  it("throws on malformed response missing id or status", async () => {
    vi.stubEnv("ASSEMBLYAI_API_KEY", "test-api-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: "some text" }),
      })
    );

    await expect(getTranscriptionStatus("transcript-123")).rejects.toThrow(
      "AssemblyAI API error: invalid response from status check"
    );
  });
});

describe("transcribeAudio", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("polls until completed and returns result", async () => {
    vi.stubEnv("ASSEMBLYAI_API_KEY", "test-api-key");

    const mockFetch = vi
      .fn()
      // First call: submitTranscription
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ id: "transcript-789", status: "queued" }),
      })
      // Second call: getTranscriptionStatus (processing)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "transcript-789",
            status: "processing",
            text: null,
            error: null,
          }),
      })
      // Third call: getTranscriptionStatus (completed)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "transcript-789",
            status: "completed",
            text: "Transcribed text here",
            error: null,
          }),
      });

    vi.stubGlobal("fetch", mockFetch);

    const result = await transcribeAudio("https://example.com/audio.mp3", {
      pollIntervalMs: 100,
    });

    expect(result).toEqual({
      id: "transcript-789",
      status: "completed",
      text: "Transcribed text here",
      error: null,
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("returns error result when transcript fails", async () => {
    vi.stubEnv("ASSEMBLYAI_API_KEY", "test-api-key");

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ id: "transcript-err", status: "queued" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "transcript-err",
            status: "error",
            text: null,
            error: "Audio download failed",
          }),
      });

    vi.stubGlobal("fetch", mockFetch);

    const result = await transcribeAudio("https://example.com/bad.mp3", {
      pollIntervalMs: 100,
    });

    expect(result.status).toBe("error");
    expect(result.error).toBe("Audio download failed");
    expect(result.text).toBeNull();
  });

  it("throws on timeout", async () => {
    vi.stubEnv("ASSEMBLYAI_API_KEY", "test-api-key");

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ id: "transcript-slow", status: "queued" }),
      })
      .mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "transcript-slow",
            status: "processing",
            text: null,
            error: null,
          }),
      });

    vi.stubGlobal("fetch", mockFetch);

    await expect(
      transcribeAudio("https://example.com/audio.mp3", {
        pollIntervalMs: 100,
        maxWaitMs: 250,
      })
    ).rejects.toThrow("Transcription timed out after 250ms");
  });

  it("throws when API key is missing", async () => {
    vi.stubEnv("ASSEMBLYAI_API_KEY", "");

    await expect(
      transcribeAudio("https://example.com/audio.mp3")
    ).rejects.toThrow("AssemblyAI API key is not configured");
  });
});
