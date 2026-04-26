import "server-only";

import type { AiMessage } from "@/lib/ai/types";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const ZAI_API_URL = "https://api.z.ai/api/coding/paas/v4/chat/completions";

export interface StreamCompletionOptions {
  provider: "openrouter" | "zai";
  model: string;
  messages: AiMessage[];
}

const CONNECT_TIMEOUT_MS = 30_000;
const STREAM_IDLE_TIMEOUT_MS = 15_000;

/**
 * Makes a streaming request to the AI provider and returns a ReadableStream of text chunks.
 * Uses raw SSE fetch — no Vercel AI SDK (see ADR-008 amendment).
 *
 * The fetch is performed before returning the stream so startup/auth/network errors
 * propagate immediately to the caller (fail-fast). The stream is abortable via cancel().
 */
export async function streamCompletion(
  options: StreamCompletionOptions,
): Promise<ReadableStream<Uint8Array>> {
  const { provider, model, messages } = options;

  const apiUrl = provider === "zai" ? ZAI_API_URL : OPENROUTER_API_URL;
  const apiKey =
    provider === "zai"
      ? process.env.ZAI_API_KEY
      : process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      `Missing API key: ${provider === "zai" ? "ZAI_API_KEY" : "OPENROUTER_API_KEY"} is not set`,
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  if (provider === "openrouter") {
    headers["HTTP-Referer"] =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    headers["X-Title"] = "ContentGenie";
  }

  const body = JSON.stringify({
    model,
    messages,
    stream: true,
    max_tokens: 4096,
    temperature: 0.7,
  });

  const abortController = new AbortController();
  const connectController = new AbortController();
  const connectTimer = setTimeout(
    () => connectController.abort(),
    CONNECT_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.any([
        abortController.signal,
        connectController.signal,
      ]),
    });
  } finally {
    clearTimeout(connectTimer);
  }

  if (!response.ok) {
    const errorText = await response
      .text()
      .catch(() => `HTTP ${response.status}`);
    throw new Error(`AI provider error: ${response.status} - ${errorText}`);
  }

  if (!response.body) {
    throw new Error("No response body from AI provider");
  }

  const reader = response.body.getReader();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const decoder = new TextDecoder();
      let buffer = "";
      let idleTimer: ReturnType<typeof setTimeout> | null = null;

      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(
          () => abortController.abort(),
          STREAM_IDLE_TIMEOUT_MS,
        );
      };

      try {
        resetIdleTimer();
        while (true) {
          const { done, value } = await reader.read();
          resetIdleTimer();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;

            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") {
              controller.close();
              return;
            }

            let parsed: unknown;
            try {
              parsed = JSON.parse(data);
            } catch {
              continue;
            }

            const content =
              (parsed as { choices?: Array<{ delta?: { content?: string } }> })
                ?.choices?.[0]?.delta?.content ?? "";

            if (content) {
              controller.enqueue(encoder.encode(content));
            }
          }
        }
      } catch (err) {
        controller.error(err);
        return;
      } finally {
        if (idleTimer) clearTimeout(idleTimer);
      }

      controller.close();
    },
    cancel() {
      abortController.abort();
      reader.cancel().catch(() => {});
    },
  });
}
