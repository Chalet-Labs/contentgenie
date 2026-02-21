import type { AiProvider, AiMessage, AiCompletionOptions } from "../types";

const ZAI_API_URL = "https://api.z.ai/api/paas/v4/chat/completions";

export class ZaiProvider implements AiProvider {
  readonly name = "zai";

  async generateCompletion(
    messages: AiMessage[],
    options: AiCompletionOptions
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

    const finishReason = data.choices[0].finish_reason;
    if (finishReason === "sensitive") {
      throw new Error(
        "Z.AI content filter: the request or response was flagged as sensitive"
      );
    }
    if (finishReason === "network_error") {
      throw new Error("Z.AI network error during completion");
    }

    return data.choices[0].message.content;
  }
}
