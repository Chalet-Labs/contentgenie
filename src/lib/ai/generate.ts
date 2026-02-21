import type { AiMessage } from "@/lib/ai/types";
import { getActiveAiConfig } from "@/lib/ai/config";
import { getAiProvider } from "@/lib/ai/provider-factory";

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
