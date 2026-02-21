import type { AiProvider, AiProviderName } from "./types";
import { OpenRouterProvider } from "./providers/openrouter";
import { ZaiProvider } from "./providers/zai";

const providers: Record<AiProviderName, AiProvider> = {
  openrouter: new OpenRouterProvider(),
  zai: new ZaiProvider(),
};

export function getAiProvider(name: AiProviderName): AiProvider {
  const provider = providers[name];
  if (!provider) {
    throw new Error(`Unknown AI provider: ${name}`);
  }
  return provider;
}
