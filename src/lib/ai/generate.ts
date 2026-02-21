import type { AiMessage } from "./types";
import { getActiveAiConfig } from "./config";
import { getAiProvider } from "./provider-factory";

export async function generateCompletion(
  messages: AiMessage[],
  options?: { model?: string; maxTokens?: number; temperature?: number }
): Promise<string> {
  const config = await getActiveAiConfig();
  const provider = getAiProvider(config.provider);

  return provider.generateCompletion(messages, {
    model: options?.model ?? config.model,
    maxTokens: options?.maxTokens,
    temperature: options?.temperature,
  });
}
