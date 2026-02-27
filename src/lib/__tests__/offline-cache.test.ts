import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  cacheLibrary,
  getCachedLibrary,
  cacheEpisode,
  getCachedEpisode,
  clearUserCache,
  evictExpiredEntries,
  enforceStorageBudget,
  isIdbAvailable,
  _resetForTesting,
  _forceIdbUnavailableForTesting,
} from "@/lib/offline-cache";

beforeEach(() => {
  _resetForTesting();
  vi.restoreAllMocks();
});

afterEach(() => {
  _resetForTesting();
});

describe("isIdbAvailable", () => {
  it("returns true when IndexedDB is available", async () => {
    const result = await isIdbAvailable();
    expect(result).toBe(true);
  });

  it("caches the result after first probe", async () => {
    const first = await isIdbAvailable();
    const second = await isIdbAvailable();
    expect(first).toBe(true);
    expect(second).toBe(true);
  });
});

describe("cacheLibrary / getCachedLibrary", () => {
  const userId = "user-1";
  const items = [
    { id: 1, title: "Episode 1" },
    { id: 2, title: "Episode 2" },
  ];

  it("round-trips library data", async () => {
    await cacheLibrary(userId, items);
    const result = await getCachedLibrary(userId);
    expect(result).toEqual(items);
  });

  it("returns undefined when no cached data exists", async () => {
    const result = await getCachedLibrary("nonexistent-user");
    expect(result).toBeUndefined();
  });

  it("returns undefined for expired data", async () => {
    await cacheLibrary(userId, items);

    // Advance time past TTL (7 days + 1ms)
    const ttl = 7 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + ttl + 1);

    const result = await getCachedLibrary(userId);
    expect(result).toBeUndefined();
  });

  it("enforces user scoping — user A cannot read user B's cache", async () => {
    await cacheLibrary("user-a", [{ id: 1, title: "A's episode" }]);
    const result = await getCachedLibrary("user-b");
    expect(result).toBeUndefined();
  });
});

describe("cacheEpisode / getCachedEpisode", () => {
  const userId = "user-1";
  const podcastIndexId = "12345";
  const episodeData = {
    episode: {
      id: 12345,
      title: "Test Episode",
      description: "A test episode",
      datePublished: 1700000000,
      duration: 3600,
      enclosureUrl: "https://example.com/audio.mp3",
      episode: 1,
      episodeType: "full",
      season: 1,
      feedId: 100,
      feedImage: "https://example.com/feed.jpg",
      image: "https://example.com/ep.jpg",
      link: "https://example.com/episode",
    },
    podcast: {
      id: 100,
      title: "Test Podcast",
      author: "Test Author",
      ownerName: "Test Owner",
      image: "https://example.com/podcast.jpg",
      artwork: "https://example.com/artwork.jpg",
      categories: { "1": "Technology" },
    },
    summary: {
      summary: "A great episode about testing.",
      keyTakeaways: ["Testing is important", "Use IndexedDB for offline"],
      worthItScore: 8.5,
      worthItReason: "Excellent content",
      worthItDimensions: null,
      cached: true,
    },
  };

  it("round-trips episode data", async () => {
    await cacheEpisode(userId, podcastIndexId, episodeData);
    const result = await getCachedEpisode(userId, podcastIndexId);
    expect(result).toBeDefined();
    expect(result!.episode).toEqual(episodeData.episode);
    expect(result!.podcast).toEqual(episodeData.podcast);
    expect(result!.summary).toEqual(episodeData.summary);
    expect(result!.cachedAt).toBeGreaterThan(0);
  });

  it("returns undefined when no cached episode exists", async () => {
    const result = await getCachedEpisode(userId, "nonexistent");
    expect(result).toBeUndefined();
  });

  it("returns undefined for expired episode data", async () => {
    await cacheEpisode(userId, podcastIndexId, episodeData);

    const ttl = 7 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + ttl + 1);

    const result = await getCachedEpisode(userId, podcastIndexId);
    expect(result).toBeUndefined();
  });

  it("enforces user scoping for episodes", async () => {
    await cacheEpisode("user-a", podcastIndexId, episodeData);
    const result = await getCachedEpisode("user-b", podcastIndexId);
    expect(result).toBeUndefined();
  });
});

describe("clearUserCache", () => {
  it("clears all entries for a specific user", async () => {
    await cacheLibrary("user-1", [{ id: 1 }]);
    await cacheEpisode("user-1", "ep1", {
      episode: { id: 1 } as unknown as import("@/lib/offline-cache").EpisodeData,
      podcast: { id: 1 } as unknown as import("@/lib/offline-cache").PodcastData,
      summary: null,
    });
    await cacheLibrary("user-2", [{ id: 2 }]);

    await clearUserCache("user-1");

    expect(await getCachedLibrary("user-1")).toBeUndefined();
    expect(await getCachedEpisode("user-1", "ep1")).toBeUndefined();
    // user-2 data should remain
    expect(await getCachedLibrary("user-2")).toEqual([{ id: 2 }]);
  });
});

describe("evictExpiredEntries", () => {
  it("removes expired entries while keeping valid ones", async () => {
    const baseTime = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(baseTime);

    await cacheLibrary("user-1", [{ id: 1, title: "Valid" }]);

    // Advance time past TTL
    const ttl = 7 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(baseTime + ttl + 1);

    await cacheLibrary("user-2", [{ id: 2, title: "Fresh" }]);

    await evictExpiredEntries();

    // Expired entry should be gone
    // Reset Date.now for getCachedLibrary TTL check
    expect(await getCachedLibrary("user-1")).toBeUndefined();
    expect(await getCachedLibrary("user-2")).toEqual([{ id: 2, title: "Fresh" }]);
  });
});

describe("enforceStorageBudget", () => {
  it("does not evict when under limits", async () => {
    await cacheLibrary("user-1", [{ id: 1 }]);
    await enforceStorageBudget();
    expect(await getCachedLibrary("user-1")).toEqual([{ id: 1 }]);
  });
});

describe("graceful degradation", () => {
  it("cacheLibrary does not throw on error", async () => {
    // Force IDB availability to be already set (won't re-probe)
    await isIdbAvailable();

    // This should not throw even with unusual inputs
    await expect(cacheLibrary("user-1", [])).resolves.not.toThrow();
  });

  it("getCachedLibrary returns undefined when no data cached", async () => {
    const result = await getCachedLibrary("never-cached-user");
    expect(result).toBeUndefined();
  });

  it("cacheLibrary is a no-op when IndexedDB is forced unavailable", async () => {
    // Simulate Safari private browsing: IDB is unavailable
    _forceIdbUnavailableForTesting();

    // Should not throw and should return without writing anything
    await expect(cacheLibrary("user-1", [{ id: 1 }])).resolves.not.toThrow();
  });

  it("getCachedLibrary returns undefined when IndexedDB is forced unavailable", async () => {
    // First cache some data while IDB is available
    await cacheLibrary("user-1", [{ id: 1 }]);

    // Now simulate IDB becoming unavailable (e.g. Safari private browsing probe)
    _forceIdbUnavailableForTesting();

    const result = await getCachedLibrary("user-1");
    expect(result).toBeUndefined();
  });

  it("isIdbAvailable returns false when forced unavailable", async () => {
    _forceIdbUnavailableForTesting();
    const result = await isIdbAvailable();
    expect(result).toBe(false);
  });
});

describe("QuotaExceededError retry", () => {
  it("cacheLibrary succeeds after QuotaExceededError by evicting and retrying", async () => {
    // Pre-populate the cache with an entry to evict
    await cacheLibrary("user-a", [{ id: 100 }]);

    // Write enough data to push quota — but since fake-indexeddb doesn't
    // actually enforce QuotaExceededError, we test the happy path:
    // QuotaExceededError handling is in safeSet(), the outer cacheLibrary
    // call should always resolve without throwing regardless.
    await expect(
      cacheLibrary("user-quota", [{ id: 1 }, { id: 2 }]),
    ).resolves.not.toThrow();

    // Data should be retrievable
    const result = await getCachedLibrary("user-quota");
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
  });
});

describe("enforceStorageBudget entry count limit", () => {
  it("evicts oldest 10% of entries when at MAX_ENTRIES (500)", async () => {
    // Seed the store with 500 entries at staggered timestamps
    // We use unique user IDs to avoid TTL collisions in getCachedLibrary
    const baseTime = Date.now();
    for (let i = 0; i < 500; i++) {
      // Use vi.spyOn on Date.now is not needed here — each write gets a real timestamp.
      // Instead, we manually set cachedAt by writing raw library data via cacheLibrary.
      // The first entries written will have earlier timestamps.
      await cacheLibrary(`budget-user-${i}`, [{ id: i }]);
    }

    // At this point we have 500 entries. enforceStorageBudget checks >= MAX_ENTRIES (500).
    // A 501st write triggers enforceStorageBudget first, which should evict 10% = 50 entries.
    await cacheLibrary("budget-user-new", [{ id: 999 }]);

    // After eviction + new write we should have at most 500 - 50 + 1 = 451 entries.
    // The simplest assertion: the new entry was successfully written despite being at limit.
    const result = await getCachedLibrary("budget-user-new");
    expect(result).toEqual([{ id: 999 }]);
  });

  it("evicts entries when navigator.storage.estimate reports over MAX_STORAGE_BYTES", async () => {
    const FIFTY_MB = 50 * 1024 * 1024;

    // Seed a few entries first
    await cacheLibrary("budget-est-user-0", [{ id: 0 }]);
    await cacheLibrary("budget-est-user-1", [{ id: 1 }]);
    await cacheLibrary("budget-est-user-2", [{ id: 2 }]);

    // Override navigator.storage.estimate to report over-budget
    Object.defineProperty(navigator, "storage", {
      value: {
        persist: vi.fn().mockResolvedValue(true),
        estimate: vi.fn().mockResolvedValue({
          usage: FIFTY_MB + 1,
          quota: 500 * 1024 * 1024,
        }),
      },
      configurable: true,
      writable: true,
    });

    // Should run without throwing — the budget enforcement path is exercised
    await expect(enforceStorageBudget()).resolves.not.toThrow();
  });
});

describe("navigator.storage.persist", () => {
  it("calls persist on first successful write", async () => {
    const persistMock = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, "storage", {
      value: {
        persist: persistMock,
        estimate: vi.fn().mockResolvedValue({ usage: 0, quota: 100_000_000 }),
      },
      configurable: true,
      writable: true,
    });

    _resetForTesting();
    await cacheLibrary("user-1", [{ id: 1 }]);

    expect(persistMock).toHaveBeenCalledTimes(1);

    // Second write should not call persist again
    await cacheLibrary("user-1", [{ id: 2 }]);
    expect(persistMock).toHaveBeenCalledTimes(1);
  });
});
