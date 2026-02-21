export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCompletionOptions {
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AiProvider {
  readonly name: string;
  generateCompletion(
    messages: AiMessage[],
    options: AiCompletionOptions
  ): Promise<string>;
}

export type AiProviderName = "openrouter" | "zai";

export interface AiConfig {
  provider: AiProviderName;
  model: string;
}
