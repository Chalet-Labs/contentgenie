import { logger } from "@trigger.dev/sdk";
import type {
  Extractor,
  ExtractorContext,
  ExtractorResult,
} from "@/trigger/helpers/transcript-extractors/types";

export type {
  Extractor,
  ExtractorContext,
  ExtractorResult,
} from "@/trigger/helpers/transcript-extractors/types";
export { linkSuffixExtractor } from "@/trigger/helpers/transcript-extractors/link-suffix";

const registry = new Map<string, Extractor>();

export function register(podcastIndexId: string, extractor: Extractor): void {
  if (registry.has(podcastIndexId)) {
    logger.warn("[transcript-extractors] duplicate registration", {
      podcastIndexId,
    });
  }
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
    const transcript = (await extractor.extract(ctx))?.trim();
    if (!transcript) return undefined;
    return { transcript, extractorId: extractor.id };
  } catch (error) {
    logger.warn("[transcript-extractors] extractor threw", {
      extractorId: extractor.id,
      podcastIndexId: ctx.podcast.podcastIndexId,
      error,
    });
    return undefined;
  }
}

// Concrete extractor registrations (issue #428).
// Order is irrelevant — the registry keys off podcastIndexId.
import {
  LEX_FRIDMAN_PODCAST_INDEX_ID,
  lexFridmanExtractor,
} from "@/trigger/helpers/transcript-extractors/lex-fridman";
register(LEX_FRIDMAN_PODCAST_INDEX_ID, lexFridmanExtractor);

import {
  LIMITLESS_PODCAST_INDEX_ID,
  limitlessExtractor,
} from "@/trigger/helpers/transcript-extractors/limitless";
register(LIMITLESS_PODCAST_INDEX_ID, limitlessExtractor);

import {
  BANKLESS_PODCAST_INDEX_ID,
  banklessExtractor,
} from "@/trigger/helpers/transcript-extractors/bankless";
register(BANKLESS_PODCAST_INDEX_ID, banklessExtractor);
