import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Clerk auth
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock database
const mockFindFirstPodcast = vi.fn();
const mockFindFirstSubscription = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockOnConflictDoNothing = vi.fn();
const mockReturning = vi.fn();
const mockSelect = vi.fn();

vi.mock("@/db", () => ({
  db: {
    query: {
      podcasts: { findFirst: (...args: unknown[]) => mockFindFirstPodcast(...args) },
      userSubscriptions: {
        findFirst: (...args: unknown[]) => mockFindFirstSubscription(...args),
      },
    },
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          return {
            onConflictDoNothing: () => {
              mockOnConflictDoNothing();
              return {
                returning: () => {
                  mockReturning();
                  return mockReturning();
                },
              };
            },
            onConflictDoUpdate: () => {
              return {
                returning: () => {
                  mockReturning();
                  return mockReturning();
                },
              };
            },
            returning: () => mockReturning(),
          };
        },
      };
    },
    batch: (queries: unknown[]) => Promise.resolve(queries),
  },
}));

// Mock RSS parser
const mockParsePodcastFeed = vi.fn();
vi.mock("@/lib/rss", async () => {
  const actual = await vi.importActual("@/lib/rss");
  return {
    ...actual,
    parsePodcastFeed: (...args: unknown[]) => mockParsePodcastFeed(...args),
  };
});

// Mock schema — just need the table references
vi.mock("@/db/schema", () => ({
  users: { id: "id" },
  podcasts: { id: "id", podcastIndexId: "podcast_index_id" },
  episodes: { id: "id", podcastIndexId: "podcast_index_id" },
  userSubscriptions: { userId: "user_id", podcastId: "podcast_id" },
}));

// Mock drizzle-orm — just need eq, and, desc, sql stubs
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  inArray: vi.fn(),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

// Mock SSRF security utility
const mockIsSafeUrl = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/security", () => ({
  isSafeUrl: (url: string) => mockIsSafeUrl(url),
}));

describe("addPodcastByRssUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // mockResolvedValueOnce queue isn't cleared by clearAllMocks — reset explicitly
    mockIsSafeUrl.mockReset();
    mockIsSafeUrl.mockResolvedValue(true);
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockFindFirstPodcast.mockResolvedValue(null);
    mockFindFirstSubscription.mockResolvedValue(null);
    mockReturning.mockReturnValue([{ id: 1 }]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns error when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { addPodcastByRssUrl } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await addPodcastByRssUrl("https://example.com/feed.xml");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/signed in/i);
  });

  it("returns error for invalid URL", async () => {
    mockIsSafeUrl.mockResolvedValueOnce(false);
    const { addPodcastByRssUrl } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await addPodcastByRssUrl("not-a-url");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/valid and safe RSS feed URL/i);
  });

  it("returns error for empty URL", async () => {
    mockIsSafeUrl.mockResolvedValueOnce(false);
    const { addPodcastByRssUrl } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await addPodcastByRssUrl("");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/valid and safe RSS feed URL/i);
  });

  it("returns error for non-http URL", async () => {
    mockIsSafeUrl.mockResolvedValueOnce(false);
    const { addPodcastByRssUrl } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await addPodcastByRssUrl("ftp://example.com/feed.xml");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/valid and safe RSS feed URL/i);
  });

  it("returns already subscribed for existing podcast + subscription", async () => {
    mockFindFirstPodcast.mockResolvedValue({
      id: 42,
      title: "Existing Podcast",
      podcastIndexId: "rss-abc123",
    });
    mockFindFirstSubscription.mockResolvedValue({ id: 1 });

    const { addPodcastByRssUrl } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await addPodcastByRssUrl("https://example.com/feed.xml");

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/already subscribed/i);
    expect(result.title).toBe("Existing Podcast");
    expect(mockParsePodcastFeed).not.toHaveBeenCalled();
  });

  it("returns error when feed parsing fails", async () => {
    mockParsePodcastFeed.mockRejectedValue(new Error("Invalid XML"));

    const { addPodcastByRssUrl } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await addPodcastByRssUrl("https://example.com/bad-feed.xml");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/could not parse/i);
  });

  it("successfully imports a podcast and returns metadata", async () => {
    // The returning() mock handler calls mockReturning twice per invocation
    // (once as tracker, once for the value). Set up the sequence:
    // calls 1-2: podcast insert returning → [{ id: 1 }]
    // calls 3-4: episode batch insert returning → [{ id: 1 }, { id: 2 }]
    mockReturning
      .mockReturnValueOnce([{ id: 1 }])
      .mockReturnValueOnce([{ id: 1 }])
      .mockReturnValueOnce([{ id: 1 }, { id: 2 }])
      .mockReturnValueOnce([{ id: 1 }, { id: 2 }]);

    mockParsePodcastFeed.mockResolvedValue({
      title: "Test Podcast",
      description: "A test podcast",
      author: "Test Author",
      imageUrl: "https://example.com/image.jpg",
      link: "https://example.com",
      feedUrl: "https://example.com/feed.xml",
      episodes: [
        {
          title: "Episode 1",
          description: "First ep",
          audioUrl: "https://example.com/ep1.mp3",
          guid: "ep-001",
          publishDate: new Date("2024-06-01"),
          duration: 3600,
        },
        {
          title: "Episode 2",
          description: "Second ep",
          audioUrl: "https://example.com/ep2.mp3",
          guid: "ep-002",
          publishDate: new Date("2024-05-01"),
          duration: 1800,
        },
      ],
    });

    const { addPodcastByRssUrl } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await addPodcastByRssUrl("https://example.com/feed.xml");

    expect(result.success).toBe(true);
    expect(result.title).toBe("Test Podcast");
    expect(result.podcastIndexId).toMatch(/^rss-/);
    expect(result.episodeCount).toBe(2);
  });
});

// Helper: mock select→from→innerJoin→where→limit chain for isSubscribedToPodcast
function mockSelectChain(resolvedValue: unknown[]) {
  const mockLimit = vi.fn().mockResolvedValue(resolvedValue);
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
  const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
  mockSelect.mockReturnValue({ from: mockFrom });
}

describe("isSubscribedToPodcast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_123" });
  });

  it("returns false when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { isSubscribedToPodcast } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await isSubscribedToPodcast("12345");

    expect(result).toBe(false);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns true when user is subscribed", async () => {
    mockSelectChain([{ exists: 1 }]);

    const { isSubscribedToPodcast } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await isSubscribedToPodcast("12345");

    expect(result).toBe(true);
    expect(mockSelect).toHaveBeenCalled();
  });

  it("returns false when user is not subscribed", async () => {
    mockSelectChain([]);

    const { isSubscribedToPodcast } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await isSubscribedToPodcast("12345");

    expect(result).toBe(false);
    expect(mockSelect).toHaveBeenCalled();
  });

  it("returns false on database error", async () => {
    mockSelect.mockImplementation(() => {
      throw new Error("DB connection failed");
    });

    const { isSubscribedToPodcast } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await isSubscribedToPodcast("12345");

    expect(result).toBe(false);
  });
});

describe("subscribeToPodcast", () => {
  const mockPodcastData = {
    podcastIndexId: "12345",
    title: "Test Podcast",
    description: "A test podcast",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockReturning.mockReturnValue([{ id: 1 }]);
  });

  it("successfully subscribes to a new podcast", async () => {
    const { subscribeToPodcast } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await subscribeToPodcast(mockPodcastData);

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/subscribed successfully/i);
    expect(mockInsert).toHaveBeenCalledTimes(3); // users, podcasts, userSubscriptions
  });

  it("handles already subscribed podcast", async () => {
    // The mock DB calls mockReturning twice per invocation of returning()
    mockReturning
      .mockReturnValueOnce([{ id: 1 }]) // podcasts call 1
      .mockReturnValueOnce([{ id: 1 }]) // podcasts call 2
      .mockReturnValueOnce([]) // userSubscriptions call 1 (conflict)
      .mockReturnValueOnce([]); // userSubscriptions call 2 (conflict)

    const { subscribeToPodcast } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await subscribeToPodcast(mockPodcastData);

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/already subscribed/i);
  });
});
