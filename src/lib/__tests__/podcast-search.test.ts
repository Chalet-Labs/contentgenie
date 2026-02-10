import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPodcasts = [
  {
    id: 1,
    podcastIndexId: "100",
    title: "Lex Fridman Podcast",
    publisher: "Lex Fridman",
    description: "Conversations about AI and science",
  },
  {
    id: 2,
    podcastIndexId: "200",
    title: "The Joe Rogan Experience",
    publisher: "Joe Rogan",
    description: "Long form conversations",
  },
  {
    id: 3,
    podcastIndexId: "300",
    title: "Huberman Lab",
    publisher: "Andrew Huberman",
    description: "Science and health",
  },
  {
    id: 4,
    podcastIndexId: "400",
    title: "Science Explained",
    publisher: "Various",
    description: "Breaking down fridman theories",
  },
];

const mockFrom = vi.fn();
const mockSelect = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return mockFrom();
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  podcasts: { id: "id", podcastIndexId: "podcastIndexId", title: "title", publisher: "publisher", description: "description" },
}));

import {
  searchLocalPodcasts,
  invalidateIndex,
  getOrBuildIndex,
} from "@/lib/podcast-search";

describe("podcast-search", () => {
  beforeEach(() => {
    invalidateIndex();
    delete (globalThis as Record<string, unknown>).__podcastSearchIndex;
    mockFrom.mockReset();
    mockSelect.mockReset();
    mockFrom.mockReturnValue(Promise.resolve(mockPodcasts));
  });

  describe("fuzzy matching", () => {
    it("finds 'Lex Fridman Podcast' when searching 'friedman' (misspelling)", async () => {
      const results = await searchLocalPodcasts("friedman");
      const match = results.find((r) => r.podcastIndexId === "100");
      expect(match).toBeDefined();
      expect(match!.title).toBe("Lex Fridman Podcast");
    });
  });

  describe("prefix matching", () => {
    it("finds 'Lex Fridman Podcast' when searching 'lex fri'", async () => {
      const results = await searchLocalPodcasts("lex fri");
      const match = results.find((r) => r.podcastIndexId === "100");
      expect(match).toBeDefined();
      expect(match!.title).toBe("Lex Fridman Podcast");
    });
  });

  describe("title boost", () => {
    it("ranks title match higher than description match for 'fridman'", async () => {
      const results = await searchLocalPodcasts("fridman");
      const titleMatch = results.find((r) => r.podcastIndexId === "100");
      const descMatch = results.find((r) => r.podcastIndexId === "400");
      expect(titleMatch).toBeDefined();
      expect(descMatch).toBeDefined();
      expect(titleMatch!.score).toBeGreaterThan(descMatch!.score);
    });
  });

  describe("empty query", () => {
    it("returns empty array for empty string", async () => {
      const results = await searchLocalPodcasts("");
      expect(results).toEqual([]);
    });

    it("returns empty array for whitespace-only string", async () => {
      const results = await searchLocalPodcasts("   ");
      expect(results).toEqual([]);
    });
  });

  describe("empty database", () => {
    it("returns empty array when DB has no podcasts", async () => {
      mockFrom.mockReturnValue(Promise.resolve([]));
      const results = await searchLocalPodcasts("anything");
      expect(results).toEqual([]);
    });
  });

  describe("invalidateIndex", () => {
    it("forces rebuild from DB on next search", async () => {
      // First search builds the index
      await searchLocalPodcasts("lex");
      const callCountAfterFirst = mockSelect.mock.calls.length;

      // Search again — should use cached index, no new DB call
      await searchLocalPodcasts("lex");
      expect(mockSelect.mock.calls.length).toBe(callCountAfterFirst);

      // Invalidate and search again — should rebuild from DB
      invalidateIndex();
      await searchLocalPodcasts("lex");
      expect(mockSelect.mock.calls.length).toBe(callCountAfterFirst + 1);
    });
  });

  describe("result shape", () => {
    it("returns LocalSearchResult with correct fields", async () => {
      const results = await searchLocalPodcasts("huberman");
      expect(results.length).toBeGreaterThan(0);
      const result = results[0];
      expect(result).toHaveProperty("podcastIndexId");
      expect(result).toHaveProperty("title");
      expect(result).toHaveProperty("publisher");
      expect(result).toHaveProperty("score");
      expect(typeof result.score).toBe("number");
    });
  });
});
