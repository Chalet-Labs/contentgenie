import "server-only";

import type {
  AiProvider,
  AiMessage,
  AiCompletionOptions,
} from "@/lib/ai/types";

const ZAI_API_URL = "https://api.z.ai/api/coding/paas/v4/chat/completions";
// Env-var name for opting into structured logs of reasoning_content snippets
// on empty-content responses. Kept as a single constant so provider + tests
// can't drift in name.
export const ZAI_DEBUG_REASONING_ENV = "ZAI_DEBUG_REASONING";
// Cap on the reasoning_content snippet surfaced via the debug log. Keep the
// log line bounded and use a code-point-safe slice so we never split a
// surrogate pair at the boundary.
const REASONING_SNIPPET_LOG_CHARS = 200;

export class ZaiProvider implements AiProvider {
  readonly name = "zai";

  async generateCompletion(
    messages: AiMessage[],
    options: AiCompletionOptions,
  ): Promise<string> {
    const apiKey = process.env.ZAI_API_KEY || "";
    if (!apiKey) {
      throw new Error("Z.AI API key is not configured");
    }

    const response = await fetch(ZAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Z.AI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.choices || data.choices.length === 0) {
      throw new Error("No response from Z.AI");
    }

    const choice = data.choices[0];

    const finishReason = choice.finish_reason;
    if (finishReason === "sensitive") {
      throw new Error(
        "Z.AI content filter: the request or response was flagged as sensitive",
      );
    }
    if (finishReason === "network_error") {
      throw new Error("Z.AI network error during completion");
    }

    if (!choice.message?.content) {
      // Z.AI reasoning models stream chain-of-thought into `reasoning_content`
      // and leave `content` empty until reasoning finishes; if `max_tokens`
      // is too small the budget is spent on reasoning (finish_reason=length)
      // with no content. Token counts + finish_reason are always safe to
      // surface; reasoning_content can echo prompt PII, so it only goes to
      // logs (never the thrown Error) and only when explicitly enabled.
      const reasoningTokens =
        data.usage?.completion_tokens_details?.reasoning_tokens;
      const completionTokens = data.usage?.completion_tokens;
      const reasoningContent: string | undefined =
        choice.message?.reasoning_content;
      if (
        process.env[ZAI_DEBUG_REASONING_ENV] === "1" &&
        typeof reasoningContent === "string" &&
        reasoningContent.length > 0
      ) {
        console.warn("[zai] empty content with reasoning_content present", {
          finish_reason: finishReason ?? null,
          completion_tokens: completionTokens ?? null,
          reasoning_tokens: reasoningTokens ?? null,
          reasoning_length: reasoningContent.length,
          reasoning_snippet: Array.from(reasoningContent)
            .slice(0, REASONING_SNIPPET_LOG_CHARS)
            .join(""),
        });
      }
      throw new Error(
        `Invalid response format from Z.AI: empty content (finish_reason=${finishReason ?? "unknown"}, completion_tokens=${completionTokens ?? "unknown"}, reasoning_tokens=${reasoningTokens ?? "unknown"}).`,
      );
    }

    return choice.message.content;
  }
}
