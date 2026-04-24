// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock drizzle-orm — eq is used by ensureUserExists but not upsertPodcast
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
}));

vi.mock("@/db/schema", () => ({
  users: { id: "id" },
  podcasts: { podcastIndexId: "podcastIndexId", id: "id" },
}));

vi.mock("@/lib/clerk-helpers", () => ({
  getClerkEmail: vi.fn(),
}));

// Capture the `set` argument passed to onConflictDoUpdate so tests can
// assert on it without caring about the surrounding Drizzle chain.
const mockOnConflictDoUpdate = vi.fn();
const mockInsert = vi.fn();

vi.mock("@/db", () => ({
  db: {
    query: {
      users: { findFirst: vi.fn() },
    },
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

function setupInsertChain(podcastId: number) {
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: mockOnConflictDoUpdate.mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: podcastId }]),
    }),
  });
}

import { upsertPodcast } from "@/db/helpers";

describe("upsertPodcast — safe mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupInsertChain(42);
  });

  it("set contains only updatedAt — no metadata updates on conflict", async () => {
    await upsertPodcast(
      {
        podcastIndexId: "pod-1",
        title: "Test Podcast",
        imageUrl: "https://example.com/art.jpg",
        description: "A great show",
        publisher: "Acme Corp",
        categories: ["tech", "science"],
        totalEpisodes: 100,
        latestEpisodeDate: new Date("2025-01-01"),
        rssFeedUrl: "https://example.com/feed.rss",
        source: "podcastindex",
      },
      { updateOnConflict: "safe" },
    );

    const [{ set }] = mockOnConflictDoUpdate.mock.calls[0];
    expect(Object.keys(set)).toEqual(["updatedAt"]);
  });

  it("strips rssFeedUrl and source from INSERT values", async () => {
    await upsertPodcast(
      {
        podcastIndexId: "pod-1",
        title: "Test Podcast",
        rssFeedUrl: "https://example.com/feed.rss",
        source: "rss",
      },
      { updateOnConflict: "safe" },
    );

    const insertValues =
      mockInsert.mock.results[0].value.values.mock.calls[0][0];
    expect(Object.hasOwn(insertValues, "rssFeedUrl")).toBe(false);
    expect(Object.hasOwn(insertValues, "source")).toBe(false);
    expect(insertValues.title).toBe("Test Podcast");
  });

  it("returns the podcast id from the DB row", async () => {
    setupInsertChain(99);

    const id = await upsertPodcast(
      { podcastIndexId: "pod-1", title: "Test" },
      { updateOnConflict: "safe" },
    );

    expect(id).toBe(99);
  });
});

describe("upsertPodcast — full mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupInsertChain(42);
  });

  it("set contains all provided fields including source and rssFeedUrl", async () => {
    const latestEpisodeDate = new Date("2025-06-15");
    await upsertPodcast(
      {
        podcastIndexId: "pod-2",
        title: "Trusted Podcast",
        rssFeedUrl: "https://trusted.com/feed.rss",
        source: "rss",
        description: "From a trusted source",
        publisher: "Trusted Inc",
        categories: ["news"],
        totalEpisodes: 50,
        latestEpisodeDate,
      },
      { updateOnConflict: "full" },
    );

    const [{ set }] = mockOnConflictDoUpdate.mock.calls[0];
    expect(set).toMatchObject({
      title: "Trusted Podcast",
      rssFeedUrl: "https://trusted.com/feed.rss",
      source: "rss",
      description: "From a trusted source",
      publisher: "Trusted Inc",
      categories: ["news"],
      totalEpisodes: 50,
      latestEpisodeDate,
    });
    expect(Object.hasOwn(set, "updatedAt")).toBe(true);
  });

  it("returns the podcast id from the DB row", async () => {
    setupInsertChain(77);

    const id = await upsertPodcast(
      { podcastIndexId: "pod-2", title: "Test" },
      { updateOnConflict: "full" },
    );

    expect(id).toBe(77);
  });

  it("defaults to full mode when no option is provided", async () => {
    await upsertPodcast({
      podcastIndexId: "pod-3",
      title: "Default Mode",
      source: "podcastindex",
      rssFeedUrl: "https://example.com/default.rss",
    });

    const [{ set }] = mockOnConflictDoUpdate.mock.calls[0];
    // Protected fields appear in full mode
    expect(Object.hasOwn(set, "source")).toBe(true);
    expect(Object.hasOwn(set, "rssFeedUrl")).toBe(true);
  });
});
