import MiniSearch from "minisearch";
import { db } from "@/db";
import { podcasts } from "@/db/schema";

interface IndexedPodcast {
  id: number;
  podcastIndexId: string;
  title: string;
  publisher: string;
  description: string;
}

export interface LocalSearchResult {
  podcastIndexId: string;
  title: string;
  publisher: string | null;
  score: number;
}

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "in", "to", "for", "with",
  "on", "at", "by", "is", "it", "be",
]);

const GLOBAL_KEY = "__podcastSearchIndex" as const;
const INDEX_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedIndex {
  index: MiniSearch<IndexedPodcast>;
  lastBuilt: number;
  documentCount: number;
}

function getCached(): CachedIndex | undefined {
  return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as
    | CachedIndex
    | undefined;
}

function setCached(value: CachedIndex): void {
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = value;
}

function createIndex(): MiniSearch<IndexedPodcast> {
  return new MiniSearch<IndexedPodcast>({
    fields: ["title", "publisher", "description"],
    storeFields: ["title", "publisher", "podcastIndexId"],
    idField: "id",
    searchOptions: {
      boost: { title: 2, publisher: 1.5, description: 1 },
      fuzzy: 0.2,
      prefix: true,
      combineWith: "OR",
    },
    processTerm: (term) => {
      const lower = term.toLowerCase();
      return STOP_WORDS.has(lower) ? null : lower;
    },
  });
}

async function fetchPodcastsFromDB(): Promise<IndexedPodcast[]> {
  const rows = await db
    .select({
      id: podcasts.id,
      podcastIndexId: podcasts.podcastIndexId,
      title: podcasts.title,
      publisher: podcasts.publisher,
      description: podcasts.description,
    })
    .from(podcasts);

  return rows.map((row) => ({
    id: row.id,
    podcastIndexId: row.podcastIndexId,
    title: row.title,
    publisher: row.publisher ?? "",
    description: row.description ?? "",
  }));
}

export async function getOrBuildIndex(): Promise<MiniSearch<IndexedPodcast>> {
  const cached = getCached();
  const now = Date.now();
  if (cached && now - cached.lastBuilt < INDEX_TTL_MS) {
    return cached.index;
  }
  const index = createIndex();
  const docs = await fetchPodcastsFromDB();
  index.addAll(docs);
  setCached({ index, lastBuilt: now, documentCount: docs.length });
  return index;
}

export async function searchLocalPodcasts(
  query: string
): Promise<LocalSearchResult[]> {
  if (!query.trim()) {
    return [];
  }
  const index = await getOrBuildIndex();
  const results = index.search(query);
  return results.map((result) => ({
    podcastIndexId: result.podcastIndexId as string,
    title: result.title as string,
    publisher: (result.publisher as string) || null,
    score: result.score,
  }));
}

export function invalidateIndex(): void {
  delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
}
