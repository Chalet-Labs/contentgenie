import { logger } from "@trigger.dev/sdk";
import type { Extractor, ExtractorContext, ExtractorResult } from "./types";

export type { Extractor, ExtractorContext, ExtractorResult } from "./types";
export { linkSuffixExtractor } from "./link-suffix";

const registry = new Map<string, Extractor>();

export function register(podcastIndexId: string, extractor: Extractor): void {
  registry.set(podcastIndexId, extractor);
}

/** Test-only. Clears the registry between tests; not for production use. */
export function __resetRegistry(): void {
  registry.clear();
}

export async function runPodcastExtractor(
  ctx: ExtractorContext,
): Promise<ExtractorResult | undefined> {
  const extractor = registry.get(ctx.podcast.podcastIndexId);
  if (!extractor) return undefined;

  try {
    const transcript = await extractor.extract(ctx);
    if (!transcript) return undefined;
    return { transcript, extractorId: extractor.id };
  } catch (error) {
    logger.warn("[transcript-extractors] extractor threw", {
      extractorId: extractor.id,
      podcastIndexId: ctx.podcast.podcastIndexId,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}
