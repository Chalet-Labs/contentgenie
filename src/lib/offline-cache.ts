import { get, set, del, keys, entries, delMany, createStore } from "idb-keyval";

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_STORAGE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_ENTRIES = 500;
const PROBE_KEY = "__probe";
const LIBRARY_CACHE_VERSION = 1;

// ─── Custom Store ─────────────────────────────────────────────────────────────

const store = createStore("contentgenie-offline", "episode-cache");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CachedEpisodeData {
  episode: EpisodeData;
  podcast: PodcastData | null;
  summary: SummaryData | null;
  cachedAt: number;
}

export interface CachedLibraryData {
  items: LibraryItem[];
  cachedAt: number;
  cacheVersion?: number;
}

// Lightweight types matching the shapes used by the pages
export interface EpisodeData {
  id: number;
  title: string;
  description: string;
  datePublished: number;
  duration: number;
  enclosureUrl: string;
  episode: number | null;
  episodeType: string;
  season: number;
  feedId: number;
  feedImage: string;
  image: string;
  link: string;
}

export interface PodcastData {
  id: number;
  title: string;
  author: string;
  ownerName: string;
  image: string;
  artwork: string;
  categories: Record<string, string>;
}

export interface SummaryData {
  summary: string;
  keyTakeaways: string[];
  worthItScore: number | null;
  worthItReason?: string;
  worthItDimensions?: {
    uniqueness: number;
    actionability: number;
    timeValue: number;
  } | null;
  cached: boolean;
}

export interface LibraryItem {
  id: number;
  userId: string;
  episodeId: number;
  savedAt: Date;
  rating: number | null;
  notes: string | null;
  collectionId: number | null;
  episode: {
    id: number;
    podcastIndexId: string;
    title: string;
    description: string | null;
    duration: number | null;
    publishDate: Date | null;
    worthItScore: string | null;
    podcast: {
      id: number;
      podcastIndexId: string;
      title: string;
      imageUrl: string | null;
    };
  };
  collection?: {
    id: number;
    name: string;
  } | null;
}

// ─── Internal state ───────────────────────────────────────────────────────────

let _idbAvailable: boolean | null = null;
let _persistRequested = false;

// ─── Availability probe ───────────────────────────────────────────────────────

export async function isIdbAvailable(): Promise<boolean> {
  if (_idbAvailable !== null) return _idbAvailable;

  try {
    await set(PROBE_KEY, 1, store);
    await del(PROBE_KEY, store);
    _idbAvailable = true;
  } catch {
    _idbAvailable = false;
  }

  return _idbAvailable;
}

// ─── Persistent storage request ───────────────────────────────────────────────

async function requestPersistentStorage(): Promise<void> {
  if (_persistRequested) return;
  try {
    if (navigator?.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch {
    // Ignore — best-effort
  }
  _persistRequested = true;
}

// ─── Safe write with QuotaExceededError retry ─────────────────────────────────

async function safeSet(key: string, value: unknown): Promise<void> {
  try {
    await set(key, value, store);
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      // Evict oldest entry and retry once
      await evictOldestEntry();
      await set(key, value, store);
    } else {
      throw error;
    }
  }
}

// ─── Evict single oldest entry ────────────────────────────────────────────────

async function evictOldestEntry(): Promise<void> {
  const allEntries = await entries<string, { cachedAt?: number }>(store);
  if (allEntries.length === 0) return;

  let oldestKey = allEntries[0][0];
  let oldestTime = allEntries[0][1]?.cachedAt ?? Infinity;

  for (const [key, value] of allEntries) {
    const cachedAt = value?.cachedAt ?? Infinity;
    if (cachedAt < oldestTime) {
      oldestTime = cachedAt;
      oldestKey = key;
    }
  }

  await del(oldestKey, store);
}

// ─── Library cache ────────────────────────────────────────────────────────────

export async function cacheLibrary(
  userId: string,
  items: LibraryItem[],
): Promise<void> {
  try {
    if (!(await isIdbAvailable())) return;

    await enforceStorageBudget();

    const data: CachedLibraryData = { items, cachedAt: Date.now(), cacheVersion: LIBRARY_CACHE_VERSION };
    await safeSet(`library:${userId}`, data);

    await requestPersistentStorage();
  } catch {
    // Graceful degradation — never throw
  }
}

export async function getCachedLibrary(
  userId: string,
): Promise<LibraryItem[] | undefined> {
  try {
    if (!(await isIdbAvailable())) return undefined;

    const data = await get<CachedLibraryData>(`library:${userId}`, store);
    if (!data) return undefined;

    if (data.cacheVersion !== LIBRARY_CACHE_VERSION) {
      void del(`library:${userId}`, store);
      return undefined;
    }

    if (Date.now() - data.cachedAt > CACHE_TTL_MS) {
      void del(`library:${userId}`, store);
      return undefined;
    }

    return data.items;
  } catch {
    return undefined;
  }
}

// ─── Episode cache ────────────────────────────────────────────────────────────

export async function cacheEpisode(
  userId: string,
  podcastIndexId: string,
  data: Omit<CachedEpisodeData, "cachedAt">,
): Promise<void> {
  try {
    if (!(await isIdbAvailable())) return;

    await enforceStorageBudget();

    const cached: CachedEpisodeData = { ...data, cachedAt: Date.now() };
    await safeSet(`episode:${userId}:${podcastIndexId}`, cached);

    await requestPersistentStorage();
  } catch {
    // Graceful degradation — never throw
  }
}

export async function getCachedEpisode(
  userId: string,
  podcastIndexId: string,
): Promise<CachedEpisodeData | undefined> {
  try {
    if (!(await isIdbAvailable())) return undefined;

    const data = await get<CachedEpisodeData>(
      `episode:${userId}:${podcastIndexId}`,
      store,
    );
    if (!data) return undefined;

    if (Date.now() - data.cachedAt > CACHE_TTL_MS) {
      void del(`episode:${userId}:${podcastIndexId}`, store);
      return undefined;
    }

    return data;
  } catch {
    return undefined;
  }
}

// ─── Maintenance ──────────────────────────────────────────────────────────────

export async function clearUserCache(userId: string): Promise<void> {
  try {
    if (!(await isIdbAvailable())) return;

    const allKeys = await keys<string>(store);
    const userKeys = allKeys.filter(
      (key) =>
        key === `library:${userId}` ||
        key.startsWith(`episode:${userId}:`),
    );

    if (userKeys.length > 0) {
      await delMany(userKeys, store);
    }
  } catch {
    // Graceful degradation
  }
}

export async function evictExpiredEntries(): Promise<void> {
  try {
    if (!(await isIdbAvailable())) return;

    const allEntries = await entries<string, { cachedAt?: number }>(store);
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, value] of allEntries) {
      if (value?.cachedAt && now - value.cachedAt > CACHE_TTL_MS) {
        expiredKeys.push(key);
      }
    }

    if (expiredKeys.length > 0) {
      await delMany(expiredKeys, store);
    }
  } catch {
    // Graceful degradation
  }
}

export async function enforceStorageBudget(): Promise<void> {
  try {
    if (!(await isIdbAvailable())) return;

    // Check entry count first (works everywhere)
    const allEntries = await entries<string, { cachedAt?: number }>(store);

    let shouldEvict = allEntries.length >= MAX_ENTRIES;

    // Check storage estimate if available
    if (!shouldEvict && navigator?.storage?.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        if (estimate.usage && estimate.usage >= MAX_STORAGE_BYTES) {
          shouldEvict = true;
        }
      } catch {
        // estimate() not supported — rely on entry count
      }
    }

    if (!shouldEvict) return;

    // Sort by cachedAt ascending (oldest first); entries missing cachedAt sort first (treated as oldest)
    const sorted = allEntries
      .sort((a, b) => (a[1].cachedAt ?? 0) - (b[1].cachedAt ?? 0));

    // Evict oldest 10% (minimum 1)
    const evictCount = Math.max(1, Math.floor(sorted.length * 0.1));
    const keysToEvict = sorted.slice(0, evictCount).map(([key]) => key);

    if (keysToEvict.length > 0) {
      await delMany(keysToEvict, store);
    }
  } catch {
    // Graceful degradation
  }
}

// ─── Testing helpers ──────────────────────────────────────────────────────────

export function _resetForTesting(): void {
  _idbAvailable = null;
  _persistRequested = false;
}

export function _forceIdbUnavailableForTesting(): void {
  _idbAvailable = false;
}
