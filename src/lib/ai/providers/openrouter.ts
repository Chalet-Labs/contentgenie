import type { AiProvider, AiMessage, AiCompletionOptions } from "../types";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterProvider implements AiProvider {
  readonly name = "openrouter";

  async generateCompletion(
    messages: AiMessage[],
    options: AiCompletionOptions
  ): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY || "";
    if (!apiKey) {
      throw new Error("OpenRouter API key is not configured");
    }

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "ContentGenie",
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
      throw new Error(
        `OpenRouter API error: ${response.status} - ${errorText}`
      );
    }

    const data = await response.json();

    if (!data.choices || data.choices.length === 0) {
      throw new Error("No response from OpenRouter");
    }

    const message = data.choices[0].message;
    if (!message?.content) {
      throw new Error("Invalid response format from OpenRouter");
    }

    return message.content;
  }
}
