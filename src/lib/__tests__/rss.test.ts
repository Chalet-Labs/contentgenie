import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseDuration,
  generatePodcastSyntheticId,
  generateEpisodeSyntheticId,
} from "@/lib/rss";

// Mock safeFetch
// We need to import safeFetch to mock it specifically for certain tests if needed
import * as security from "@/lib/security";

vi.mock("@/lib/security", () => ({
  safeFetch: vi.fn().mockResolvedValue("<rss>...</rss>"),
  isSafeUrl: vi.fn().mockResolvedValue(true),
}));

// Mock rss-parser at module level — vi.hoisted ensures the fn is available
// when the factory runs (vi.mock is hoisted above imports)
const { mockParseURL, mockParseString } = vi.hoisted(() => ({
  mockParseURL: vi.fn(),
  mockParseString: vi.fn(),
}));

vi.mock("rss-parser", () => ({
  default: class MockParser {
    options: Record<string, unknown> = {};
    parseURL = mockParseURL;
    parseString = mockParseString;
  },
}));

describe("parseDuration", () => {
  it("parses HH:MM:SS format", () => {
    expect(parseDuration("01:30:45")).toBe(5445);
    expect(parseDuration("00:00:00")).toBe(0);
    expect(parseDuration("02:00:00")).toBe(7200);
  });

  it("parses MM:SS format", () => {
    expect(parseDuration("45:30")).toBe(2730);
    expect(parseDuration("00:30")).toBe(30);
    expect(parseDuration("01:00")).toBe(60);
  });

  it("parses numeric string (seconds)", () => {
    expect(parseDuration("3600")).toBe(3600);
    expect(parseDuration("0")).toBe(0);
    expect(parseDuration("90")).toBe(90);
  });

  it("parses number type (seconds)", () => {
    expect(parseDuration(3600)).toBe(3600);
    expect(parseDuration(0)).toBe(0);
    expect(parseDuration(90.7)).toBe(91);
  });

  it("returns null for undefined/null/empty", () => {
    expect(parseDuration(undefined)).toBeNull();
    expect(parseDuration(null)).toBeNull();
    expect(parseDuration("")).toBeNull();
  });

  it("returns null for invalid values", () => {
    expect(parseDuration("invalid")).toBeNull();
    expect(parseDuration("abc:def")).toBeNull();
    expect(parseDuration(NaN)).toBeNull();
    expect(parseDuration(Infinity)).toBeNull();
  });

  it("handles fractional numeric strings", () => {
    expect(parseDuration("90.5")).toBe(91);
  });

  it("rounds fractional seconds in HH:MM:SS format", () => {
    expect(parseDuration("01:02:03.45")).toBe(3723);
  });

  it("rounds fractional seconds in MM:SS format", () => {
    expect(parseDuration("02:30.5")).toBe(151);
  });
});

describe("parsePodcastFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset safeFetch to default success
    vi.mocked(security.safeFetch).mockResolvedValue("<rss>...</rss>");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const fullFeed = {
    title: "Test Podcast",
    description: "A great podcast about testing",
    link: "https://example.com/podcast",
    image: { url: "https://example.com/image.jpg" },
    itunes: {
      author: "Test Author",
      image: "https://example.com/itunes-image.jpg",
    },
    items: [
      {
        title: "Episode 1",
        contentSnippet: "First episode description",
        guid: "ep-001",
        pubDate: "Mon, 01 Jan 2024 00:00:00 GMT",
        enclosure: { url: "https://example.com/ep1.mp3" },
        "itunes:duration": "01:30:00",
      },
      {
        title: "Episode 2",
        content: "<p>Second episode (HTML)</p>",
        contentSnippet: "Second episode (HTML)",
        guid: "ep-002",
        pubDate: "Tue, 02 Jan 2024 00:00:00 GMT",
        enclosure: { url: "https://example.com/ep2.mp3" },
        "itunes:duration": "45:30",
      },
    ],
  };

  it("parses a well-formed feed with full metadata", async () => {
    mockParseString.mockResolvedValueOnce(fullFeed);

    const { parsePodcastFeed } = await import("@/lib/rss");
    const result = await parsePodcastFeed("https://example.com/feed.xml");

    expect(result.title).toBe("Test Podcast");
    expect(result.description).toBe("A great podcast about testing");
    expect(result.author).toBe("Test Author");
    expect(result.imageUrl).toBe("https://example.com/image.jpg");
    expect(result.link).toBe("https://example.com/podcast");
    expect(result.feedUrl).toBe("https://example.com/feed.xml");
    expect(result.episodes).toHaveLength(2);
  });

  it("maps episode fields correctly", async () => {
    mockParseString.mockResolvedValueOnce(fullFeed);

    const { parsePodcastFeed } = await import("@/lib/rss");
    const result = await parsePodcastFeed("https://example.com/feed.xml");
    const ep = result.episodes[0];

    expect(ep.title).toBe("Episode 1");
    expect(ep.description).toBe("First episode description");
    expect(ep.audioUrl).toBe("https://example.com/ep1.mp3");
    expect(ep.guid).toBe("ep-001");
    expect(ep.publishDate).toEqual(new Date("2024-01-01T00:00:00.000Z"));
    expect(ep.duration).toBe(5400);
  });

  it("parses MM:SS duration in episodes", async () => {
    mockParseString.mockResolvedValueOnce(fullFeed);

    const { parsePodcastFeed } = await import("@/lib/rss");
    const result = await parsePodcastFeed("https://example.com/feed.xml");

    expect(result.episodes[1].duration).toBe(2730);
  });

  it("falls back to itunes.image when feed.image is missing", async () => {
    mockParseString.mockResolvedValueOnce({
      ...fullFeed,
      image: undefined,
    });

    const { parsePodcastFeed } = await import("@/lib/rss");
    const result = await parsePodcastFeed("https://example.com/feed.xml");

    expect(result.imageUrl).toBe("https://example.com/itunes-image.jpg");
  });

  it("handles feed with missing optional fields", async () => {
    mockParseString.mockResolvedValueOnce({
      title: "Minimal Podcast",
      items: [],
    });

    const { parsePodcastFeed } = await import("@/lib/rss");
    const result = await parsePodcastFeed("https://example.com/feed.xml");

    expect(result.title).toBe("Minimal Podcast");
    expect(result.description).toBeNull();
    expect(result.author).toBeNull();
    expect(result.imageUrl).toBeNull();
    expect(result.link).toBeNull();
    expect(result.episodes).toHaveLength(0);
  });

  it("handles episodes with missing enclosure", async () => {
    mockParseString.mockResolvedValueOnce({
      title: "Podcast",
      items: [{ title: "No Audio", guid: "no-audio-001" }],
    });

    const { parsePodcastFeed } = await import("@/lib/rss");
    const result = await parsePodcastFeed("https://example.com/feed.xml");

    expect(result.episodes[0].audioUrl).toBeNull();
  });

  it("falls back guid to link when guid is missing", async () => {
    mockParseString.mockResolvedValueOnce({
      title: "Podcast",
      items: [
        {
          title: "No GUID Episode",
          link: "https://example.com/ep1",
        },
      ],
    });

    const { parsePodcastFeed } = await import("@/lib/rss");
    const result = await parsePodcastFeed("https://example.com/feed.xml");

    expect(result.episodes[0].guid).toBe("https://example.com/ep1");
  });

  it("falls back guid to enclosure URL when guid and link are missing", async () => {
    mockParseString.mockResolvedValueOnce({
      title: "Podcast",
      items: [
        {
          title: "Audio Only",
          enclosure: { url: "https://example.com/ep1.mp3" },
        },
      ],
    });

    const { parsePodcastFeed } = await import("@/lib/rss");
    const result = await parsePodcastFeed("https://example.com/feed.xml");

    expect(result.episodes[0].guid).toBe("https://example.com/ep1.mp3");
  });

  it("throws when no unique identifier is available for an episode", async () => {
    mockParseString.mockResolvedValueOnce({
      title: "Podcast",
      items: [{ title: "Completely Unknown" }],
    });

    const { parsePodcastFeed } = await import("@/lib/rss");

    await expect(
      parsePodcastFeed("https://example.com/feed.xml"),
    ).rejects.toThrow("Could not determine a unique identifier for episode");
  });

  it("handles episodes with missing duration", async () => {
    mockParseString.mockResolvedValueOnce({
      title: "Podcast",
      items: [{ title: "No Duration", guid: "nd-001" }],
    });

    const { parsePodcastFeed } = await import("@/lib/rss");
    const result = await parsePodcastFeed("https://example.com/feed.xml");

    expect(result.episodes[0].duration).toBeNull();
  });

  it("handles episodes with invalid publish date", async () => {
    mockParseString.mockResolvedValueOnce({
      title: "Podcast",
      items: [
        { title: "Bad Date", guid: "bd-001", pubDate: "not-a-date" },
      ],
    });

    const { parsePodcastFeed } = await import("@/lib/rss");
    const result = await parsePodcastFeed("https://example.com/feed.xml");

    expect(result.episodes[0].publishDate).toBeNull();
  });

  it("defaults title to 'Untitled Podcast' when missing", async () => {
    mockParseString.mockResolvedValueOnce({ items: [] });

    const { parsePodcastFeed } = await import("@/lib/rss");
    const result = await parsePodcastFeed("https://example.com/feed.xml");

    expect(result.title).toBe("Untitled Podcast");
  });

  it("defaults episode title to 'Untitled Episode' when missing", async () => {
    mockParseString.mockResolvedValueOnce({
      title: "Podcast",
      items: [{ guid: "notitle-001" }],
    });

    const { parsePodcastFeed } = await import("@/lib/rss");
    const result = await parsePodcastFeed("https://example.com/feed.xml");

    expect(result.episodes[0].title).toBe("Untitled Episode");
  });

  it("throws descriptive error on network failure", async () => {
    // Mock safeFetch failure
    vi.mocked(security.safeFetch).mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const { parsePodcastFeed } = await import("@/lib/rss");

    await expect(
      parsePodcastFeed("https://example.com/bad-feed.xml"),
    ).rejects.toThrow(
      "Failed to parse RSS feed at https://example.com/bad-feed.xml: ECONNREFUSED",
    );
  });

  it("throws descriptive error on invalid XML", async () => {
    mockParseString.mockRejectedValueOnce(new Error("Invalid XML"));

    const { parsePodcastFeed } = await import("@/lib/rss");

    await expect(
      parsePodcastFeed("https://example.com/not-xml"),
    ).rejects.toThrow("Failed to parse RSS feed");
  });

  it("prefers contentSnippet over content for description", async () => {
    mockParseString.mockResolvedValueOnce({
      title: "Podcast",
      items: [
        {
          title: "Ep",
          guid: "ep-001",
          content: "<p>HTML content</p>",
          contentSnippet: "Plain text content",
        },
      ],
    });

    const { parsePodcastFeed } = await import("@/lib/rss");
    const result = await parsePodcastFeed("https://example.com/feed.xml");

    expect(result.episodes[0].description).toBe("Plain text content");
  });

  it("falls back to content when contentSnippet is missing", async () => {
    mockParseString.mockResolvedValueOnce({
      title: "Podcast",
      items: [
        {
          title: "Ep",
          guid: "ep-001",
          content: "<p>HTML only</p>",
        },
      ],
    });

    const { parsePodcastFeed } = await import("@/lib/rss");
    const result = await parsePodcastFeed("https://example.com/feed.xml");

    expect(result.episodes[0].description).toBe("<p>HTML only</p>");
  });
});

describe("generatePodcastSyntheticId", () => {
  it("returns a deterministic rss- prefixed ID", () => {
    const id1 = generatePodcastSyntheticId("https://example.com/feed.xml");
    const id2 = generatePodcastSyntheticId("https://example.com/feed.xml");
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^rss-[a-f0-9]{16}$/);
  });

  it("normalizes trailing slashes", () => {
    const a = generatePodcastSyntheticId("https://example.com/feed/");
    const b = generatePodcastSyntheticId("https://example.com/feed");
    expect(a).toBe(b);
  });

  it("normalizes protocol (http vs https)", () => {
    const a = generatePodcastSyntheticId("http://example.com/feed.xml");
    const b = generatePodcastSyntheticId("https://example.com/feed.xml");
    expect(a).toBe(b);
  });

  it("normalizes hostname case but preserves path case", () => {
    const a = generatePodcastSyntheticId("https://Example.COM/feed.xml");
    const b = generatePodcastSyntheticId("https://example.com/feed.xml");
    expect(a).toBe(b);

    // Different path casing should produce different IDs
    const c = generatePodcastSyntheticId("https://example.com/Feed.xml");
    const d = generatePodcastSyntheticId("https://example.com/feed.xml");
    expect(c).not.toBe(d);
  });

  it("produces different IDs for different URLs", () => {
    const a = generatePodcastSyntheticId("https://example.com/feed1.xml");
    const b = generatePodcastSyntheticId("https://example.com/feed2.xml");
    expect(a).not.toBe(b);
  });
});

describe("generateEpisodeSyntheticId", () => {
  it("returns a deterministic rss- prefixed ID", () => {
    const id1 = generateEpisodeSyntheticId("https://example.com/feed.xml", "ep-001");
    const id2 = generateEpisodeSyntheticId("https://example.com/feed.xml", "ep-001");
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^rss-[a-f0-9]{16}$/);
  });

  it("produces different IDs for different GUIDs", () => {
    const a = generateEpisodeSyntheticId("https://example.com/feed.xml", "ep-001");
    const b = generateEpisodeSyntheticId("https://example.com/feed.xml", "ep-002");
    expect(a).not.toBe(b);
  });

  it("produces different IDs for same GUID on different feeds", () => {
    const a = generateEpisodeSyntheticId("https://example.com/feed1.xml", "ep-001");
    const b = generateEpisodeSyntheticId("https://example.com/feed2.xml", "ep-001");
    expect(a).not.toBe(b);
  });

  it("normalizes hostname and trailing slashes consistently", () => {
    const a = generateEpisodeSyntheticId("http://Example.COM/feed/", "ep-001");
    const b = generateEpisodeSyntheticId("https://example.com/feed", "ep-001");
    expect(a).toBe(b);
  });
});
