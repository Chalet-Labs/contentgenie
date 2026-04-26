// Top-N most-frequent existing category strings, sampled from episode_topics
// and cached at module scope so that repeated summarization calls during a
// single ingestion burst don't pound the DB. The banlist is injected into the
// summarization prompt (and the topic-label validator) as forbidden topic
// labels — the LLM is instructed to reject any canonical-topic label that
// exact-matches a known category, since categories live on the broad-tag layer
// and would otherwise pollute the new canonical-topic layer.
//
// Cache pattern mirrors src/lib/podcast-search.ts (globalThis-backed,
// Date.now()-checked) so per-process state survives across hot module reloads
// and serverless warm starts but stays per-instance (no Redis needed at this
// scale). Admin actions that change category distribution can call
// invalidateCategoryBanlist() to force a refetch on the next read.

import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { episodeTopics } from "@/db/schema";

const GLOBAL_KEY = "__categoryBanlistCache" as const;
const TTL_MS = 60 * 60 * 1000; // 1 hour
const TOP_N = 50;

interface CachedBanlist {
  banlist: readonly string[];
  loadedAt: number;
}

function read(): CachedBanlist | undefined {
  return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as
    | CachedBanlist
    | undefined;
}

function write(value: CachedBanlist): void {
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = value;
}

export async function getCategoryBanlist(): Promise<readonly string[]> {
  const cached = read();
  const now = Date.now();
  if (cached && now - cached.loadedAt < TTL_MS) {
    return cached.banlist;
  }

  // Soft-fail: a missing banlist degrades prompt quality (LLM gets no
  // negative-examples hint, validator drops nothing on the banlist criterion)
  // but must NOT abort summarization. Prefer a stale cache to an empty list
  // so a transient Neon hiccup during a deploy doesn't strand the LLM with
  // zero hints. The summarizer is on a multi-second-cost retry loop; banlist
  // failure should not amplify that.
  try {
    const rows = await db
      .select({
        topic: episodeTopics.topic,
        n: sql<number>`count(*)`.as("n"),
      })
      .from(episodeTopics)
      .groupBy(episodeTopics.topic)
      .orderBy(desc(sql`count(*)`))
      .limit(TOP_N);

    // Freeze the cached array so a caller doing
    // `(await getCategoryBanlist() as string[]).push(...)` can't silently
    // corrupt the module-scope cache for the rest of the TTL window.
    const banlist = Object.freeze(rows.map((r) => r.topic));
    write({ banlist, loadedAt: now });
    return banlist;
  } catch (err) {
    console.warn(
      `[category-banlist] DB query failed, using ${cached ? "stale cache" : "empty banlist"}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return cached?.banlist ?? [];
  }
}

export function invalidateCategoryBanlist(): void {
  delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
}
