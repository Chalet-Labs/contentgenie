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

  it("set contains all safe display fields when all are provided", async () => {
    const latestEpisodeDate = new Date("2025-01-01");
    await upsertPodcast(
      {
        podcastIndexId: "pod-1",
        title: "Test Podcast",
        imageUrl: "https://example.com/art.jpg",
        description: "A great show",
        publisher: "Acme Corp",
        categories: ["tech", "science"],
        totalEpisodes: 100,
        latestEpisodeDate,
        rssFeedUrl: "https://example.com/feed.rss",
        source: "podcastindex",
      },
      { updateOnConflict: "safe" }
    );

    const [{ set }] = mockOnConflictDoUpdate.mock.calls[0];
    expect(set).toMatchObject({
      title: "Test Podcast",
      imageUrl: "https://example.com/art.jpg",
      description: "A great show",
      publisher: "Acme Corp",
      categories: ["tech", "science"],
      totalEpisodes: 100,
      latestEpisodeDate,
    });
    expect(Object.hasOwn(set, "updatedAt")).toBe(true);
  });

  it("set does NOT contain source, rssFeedUrl, or lastPolledAt", async () => {
    await upsertPodcast(
      {
        podcastIndexId: "pod-1",
        title: "Test Podcast",
        rssFeedUrl: "https://example.com/feed.rss",
        source: "rss",
      },
      { updateOnConflict: "safe" }
    );

    const [{ set }] = mockOnConflictDoUpdate.mock.calls[0];
    expect(Object.hasOwn(set, "source")).toBe(false);
    expect(Object.hasOwn(set, "rssFeedUrl")).toBe(false);
    expect(Object.hasOwn(set, "lastPolledAt")).toBe(false);
  });

  it("filters null/undefined optional fields from set", async () => {
    await upsertPodcast(
      {
        podcastIndexId: "pod-1",
        title: "Test Podcast",
        imageUrl: "https://example.com/art.jpg",
        // description, publisher, categories, totalEpisodes, latestEpisodeDate all absent
      },
      { updateOnConflict: "safe" }
    );

    const [{ set }] = mockOnConflictDoUpdate.mock.calls[0];
    expect(Object.hasOwn(set, "description")).toBe(false);
    expect(Object.hasOwn(set, "publisher")).toBe(false);
    expect(Object.hasOwn(set, "categories")).toBe(false);
    expect(Object.hasOwn(set, "totalEpisodes")).toBe(false);
    expect(Object.hasOwn(set, "latestEpisodeDate")).toBe(false);
    // title and imageUrl are provided, so they should be present
    expect(set.title).toBe("Test Podcast");
    expect(set.imageUrl).toBe("https://example.com/art.jpg");
  });

  it("set contains only updatedAt when all optional fields are undefined", async () => {
    await upsertPodcast(
      {
        podcastIndexId: "pod-1",
        title: "Minimal Podcast",
        // no optional fields
      },
      { updateOnConflict: "safe" }
    );

    const [{ set }] = mockOnConflictDoUpdate.mock.calls[0];
    // title is always in safeDisplayFields — it's required and always present
    // Only updatedAt should appear alongside title
    const keys = Object.keys(set);
    expect(keys).toEqual(expect.arrayContaining(["title", "updatedAt"]));
    expect(keys.filter((k) => !["title", "updatedAt"].includes(k))).toHaveLength(0);
  });

  it("returns the podcast id from the DB row", async () => {
    setupInsertChain(99);

    const id = await upsertPodcast(
      { podcastIndexId: "pod-1", title: "Test" },
      { updateOnConflict: "safe" }
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
      { updateOnConflict: "full" }
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
      { updateOnConflict: "full" }
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
