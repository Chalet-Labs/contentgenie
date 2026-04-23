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
const mockFindFirstUser = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockOnConflictDoNothing = vi.fn();
const mockOnConflictDoUpdate = vi.fn();
const mockReturning = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateSet = vi.fn();
const mockUpdateWhere = vi.fn();
const mockUpdateReturning = vi.fn();

vi.mock("@/db", () => ({
  db: {
    query: {
      users: { findFirst: (...args: unknown[]) => mockFindFirstUser(...args) },
      podcasts: { findFirst: (...args: unknown[]) => mockFindFirstPodcast(...args) },
      userSubscriptions: {
        findFirst: (...args: unknown[]) => mockFindFirstSubscription(...args),
      },
    },
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: (...sArgs: unknown[]) => {
          mockUpdateSet(...sArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockUpdateWhere(...wArgs);
              const thenable = {
                returning: (...rArgs: unknown[]) =>
                  mockUpdateReturning(...rArgs),
                then: (
                  onFulfilled?: ((v: unknown) => unknown) | null,
                  onRejected?: ((r: unknown) => unknown) | null,
                ) => Promise.resolve().then(onFulfilled, onRejected),
              };
              return thenable;
            },
          };
        },
      };
    },
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          const chain = {
            onConflictDoNothing: () => {
              mockOnConflictDoNothing();
              return {
                returning: () => mockReturning(),
              };
            },
            onConflictDoUpdate: () => {
              mockOnConflictDoUpdate();
              return {
                returning: () => mockReturning(),
              };
            },
            returning: () => mockReturning(),
          };
          return chain;
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
  users: { id: "id", preferences: "preferences" },
  podcasts: {
    id: "id",
    podcastIndexId: "podcast_index_id",
    title: "title",
    latestEpisodeDate: "latest_episode_date",
    description: "description",
  },
  episodes: {
    id: "id",
    podcastIndexId: "podcast_index_id",
    podcastId: "podcast_id",
  },
  userSubscriptions: {
    id: "id",
    userId: "user_id",
    podcastId: "podcast_id",
    subscribedAt: "subscribed_at",
    isPinned: "is_pinned",
  },
  listenHistory: {
    id: "id",
    userId: "user_id",
    episodeId: "episode_id",
    startedAt: "started_at",
  },
  SUBSCRIPTION_SORTS: [
    "recently-added",
    "title-asc",
    "latest-episode",
    "recently-listened",
  ] as const,
}));

// Mock drizzle-orm — capture orderBy/join args to assert sort wiring
const sqlTemplate = (strings: TemplateStringsArray, ...values: unknown[]) => {
  const result: { strings: TemplateStringsArray; values: unknown[]; alias?: string } = {
    strings,
    values,
  };
  (result as typeof result & { as: (a: string) => typeof result }).as = (
    alias: string,
  ) => ({ ...result, alias });
  return result;
};
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ __op: "eq", a, b })),
  and: vi.fn((...args: unknown[]) => ({ __op: "and", args })),
  desc: vi.fn((col: unknown) => ({ __op: "desc", col })),
  asc: vi.fn((col: unknown) => ({ __op: "asc", col })),
  inArray: vi.fn(),
  sql: sqlTemplate,
  max: vi.fn(),
  getTableColumns: vi.fn(() => ({
    id: "id",
    podcastIndexId: "podcast_index_id",
    title: "title",
    latestEpisodeDate: "latest_episode_date",
    description: "description",
  })),
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
    // 1. podcast insert returning → [{ id: 1 }]
    // 2. episode batch insert returning → [{ id: 1 }, { id: 2 }]
    mockReturning
      .mockReturnValueOnce([{ id: 1 }])
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

describe("subscribeToPodcast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockReturning.mockReturnValue([{ id: 1 }]);
  });

  it("successfully subscribes to a new podcast", async () => {
    // 1. podcast insert -> [{id: 1}]
    // 2. subscription insert -> [{id: 2}]
    mockReturning
      .mockReturnValueOnce([{ id: 1 }])
      .mockReturnValueOnce([{ id: 2 }]);

    const { subscribeToPodcast } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await subscribeToPodcast({
      podcastIndexId: "12345",
      title: "Test Podcast",
    });

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/subscribed successfully/i);
    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1); // podcast (no-op touch)
    expect(mockOnConflictDoNothing).toHaveBeenCalledTimes(2); // user and subscription
  });

  it("handles already subscribed case correctly", async () => {
    // 1. podcast insert -> [{id: 1}]
    // 2. subscription insert (onConflictDoNothing) -> []
    mockReturning
      .mockReturnValueOnce([{ id: 1 }])
      .mockReturnValueOnce([]);

    const { subscribeToPodcast } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await subscribeToPodcast({
      podcastIndexId: "12345",
      title: "Test Podcast",
    });

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/already subscribed/i);
  });
});

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

// Helper: mock the main subscriptions list select chain
// (select → from → innerJoin [→ leftJoin]? → where → orderBy → Promise<rows>)
function makeSubsListChain(
  rows: unknown[],
  { recentlyListened = false }: { recentlyListened?: boolean } = {},
) {
  const mockOrderBy = vi.fn().mockResolvedValue(rows);
  const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
  const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
  const mockInnerJoin = vi.fn().mockReturnValue(
    recentlyListened ? { leftJoin: mockLeftJoin } : { where: mockWhere },
  );
  const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
  return {
    chain: { from: mockFrom },
    mocks: {
      mockFrom,
      mockInnerJoin,
      mockLeftJoin,
      mockWhere,
      mockOrderBy,
    },
  };
}

// Helper: mock the "last listened" subquery chain
// (select → from → innerJoin → where → groupBy → as → opaque subquery token)
function makeLastListenedSubqueryChain() {
  const subqueryToken = {
    __subquery: "last_listened",
    podcastId: "ll_podcast_id",
    lastStartedAt: "ll_last_started_at",
  };
  const mockAs = vi.fn().mockReturnValue(subqueryToken);
  const mockGroupBy = vi.fn().mockReturnValue({ as: mockAs });
  const mockWhere = vi.fn().mockReturnValue({ groupBy: mockGroupBy });
  const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
  const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
  return { from: mockFrom };
}

describe("getUserSubscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_123" });
    mockFindFirstUser.mockResolvedValue({ preferences: null });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns error when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { getUserSubscriptions } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await getUserSubscriptions();

    expect(result.subscriptions).toEqual([]);
    expect(result.error).toMatch(/signed in/i);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("uses recently-added default when no arg and no stored preference", async () => {
    const { chain, mocks } = makeSubsListChain([]);
    mockSelect.mockReturnValue(chain);

    const { getUserSubscriptions } = await import(
      "@/app/actions/subscriptions"
    );
    await getUserSubscriptions();

    // orderBy called with (desc(isPinned), desc(subscribedAt))
    expect(mocks.mockOrderBy).toHaveBeenCalledWith(
      { __op: "desc", col: "is_pinned" },
      { __op: "desc", col: "subscribed_at" },
    );
    expect(mocks.mockLeftJoin).not.toHaveBeenCalled();
  });

  it("uses stored preference when no sort arg provided", async () => {
    mockFindFirstUser.mockResolvedValue({
      preferences: { subscriptionSort: "title-asc" },
    });
    const { chain, mocks } = makeSubsListChain([]);
    mockSelect.mockReturnValue(chain);

    const { getUserSubscriptions } = await import(
      "@/app/actions/subscriptions"
    );
    await getUserSubscriptions();

    expect(mocks.mockOrderBy).toHaveBeenCalledWith(
      { __op: "desc", col: "is_pinned" },
      { __op: "asc", col: "title" },
    );
  });

  it("explicit sort argument wins over stored preference", async () => {
    mockFindFirstUser.mockResolvedValue({
      preferences: { subscriptionSort: "title-asc" },
    });
    const { chain, mocks } = makeSubsListChain([]);
    mockSelect.mockReturnValue(chain);

    const { getUserSubscriptions } = await import(
      "@/app/actions/subscriptions"
    );
    await getUserSubscriptions("latest-episode");

    // stored pref lookup skipped when arg is passed
    expect(mockFindFirstUser).not.toHaveBeenCalled();
    // 2nd orderBy arg is an sql`${latestEpisodeDate} DESC NULLS LAST` template
    const callArgs = mocks.mockOrderBy.mock.calls[0];
    expect(callArgs[0]).toEqual({ __op: "desc", col: "is_pinned" });
    expect(callArgs[1]).toMatchObject({
      strings: expect.any(Object),
      values: ["latest_episode_date"],
    });
  });

  it("falls back to default when stored preference is an unknown value", async () => {
    mockFindFirstUser.mockResolvedValue({
      preferences: { subscriptionSort: "bogus-value" },
    });
    const { chain, mocks } = makeSubsListChain([]);
    mockSelect.mockReturnValue(chain);

    const { getUserSubscriptions } = await import(
      "@/app/actions/subscriptions"
    );
    await getUserSubscriptions();

    // falls through to recently-added
    expect(mocks.mockOrderBy).toHaveBeenCalledWith(
      { __op: "desc", col: "is_pinned" },
      { __op: "desc", col: "subscribed_at" },
    );
  });

  it("recently-listened path builds a leftJoin on a grouped subquery", async () => {
    const subqueryChain = makeLastListenedSubqueryChain();
    const main = makeSubsListChain([], { recentlyListened: true });
    mockSelect
      .mockReturnValueOnce(subqueryChain)
      .mockReturnValueOnce(main.chain);

    const { getUserSubscriptions } = await import(
      "@/app/actions/subscriptions"
    );
    await getUserSubscriptions("recently-listened");

    expect(main.mocks.mockLeftJoin).toHaveBeenCalledTimes(1);
    // orderBy: desc(isPinned), sql`COALESCE(...) DESC`, desc(subscribedAt) tiebreaker
    const [pinnedArg, coalesceArg, tiebreakerArg] =
      main.mocks.mockOrderBy.mock.calls[0];
    expect(pinnedArg).toEqual({ __op: "desc", col: "is_pinned" });
    expect(coalesceArg).toMatchObject({ strings: expect.any(Object) });
    expect(tiebreakerArg).toEqual({ __op: "desc", col: "subscribed_at" });
  });

  it("reshapes joined rows into the flat podcast-nested shape", async () => {
    const rows = [
      {
        subscription: {
          id: 1,
          userId: "user_123",
          podcastId: 42,
          isPinned: true,
          subscribedAt: new Date("2024-01-01"),
        },
        podcast: { id: 42, title: "Pinned Pod" },
      },
      {
        subscription: {
          id: 2,
          userId: "user_123",
          podcastId: 43,
          isPinned: false,
          subscribedAt: new Date("2024-01-02"),
        },
        podcast: { id: 43, title: "Other Pod" },
      },
    ];
    const { chain } = makeSubsListChain(rows);
    mockSelect.mockReturnValue(chain);

    const { getUserSubscriptions } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await getUserSubscriptions();

    expect(result.error).toBeNull();
    expect(result.subscriptions).toHaveLength(2);
    expect(result.subscriptions[0]).toMatchObject({
      id: 1,
      isPinned: true,
      podcast: { id: 42, title: "Pinned Pod" },
    });
  });

  it("returns error envelope on database failure", async () => {
    mockSelect.mockImplementation(() => {
      throw new Error("db exploded");
    });

    const { getUserSubscriptions } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await getUserSubscriptions();

    expect(result.subscriptions).toEqual([]);
    expect(result.error).toMatch(/failed to load/i);
  });
});

describe("togglePinSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_123" });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns error when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { togglePinSubscription } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await togglePinSubscription(1);

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/signed in/i),
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN])(
    "rejects invalid subscription id: %s",
    async (badId) => {
      const { togglePinSubscription } = await import(
        "@/app/actions/subscriptions"
      );
      const result = await togglePinSubscription(badId);

      expect(result).toEqual({
        success: false,
        error: expect.stringMatching(/invalid/i),
      });
      expect(mockUpdate).not.toHaveBeenCalled();
    },
  );

  it("returns not-found when the UPDATE RETURNING is empty (ownership or bad id)", async () => {
    mockUpdateReturning.mockResolvedValue([]);

    const { togglePinSubscription } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await togglePinSubscription(999);

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/not found/i),
    });
  });

  it("returns the new isPinned state from RETURNING and calls revalidatePath", async () => {
    const { revalidatePath } = await import("next/cache");
    mockUpdateReturning.mockResolvedValue([{ isPinned: true }]);

    const { togglePinSubscription } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await togglePinSubscription(42);

    expect(result).toEqual({ success: true, data: { isPinned: true } });
    expect(revalidatePath).toHaveBeenCalledWith("/subscriptions");
    // The set() call receives an sql-tagged template, not a JS boolean
    expect(mockUpdateSet).toHaveBeenCalledTimes(1);
    const setArg = mockUpdateSet.mock.calls[0][0] as { isPinned: unknown };
    expect(typeof setArg.isPinned).not.toBe("boolean");
    expect(setArg.isPinned).toMatchObject({ strings: expect.any(Object) });
  });

  it("returns error envelope on database failure", async () => {
    mockUpdateReturning.mockRejectedValue(new Error("db exploded"));

    const { togglePinSubscription } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await togglePinSubscription(1);

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/failed to toggle/i),
    });
  });
});

describe("setSubscriptionSort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_123" });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns error when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { setSubscriptionSort } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await setSubscriptionSort("title-asc");

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/signed in/i),
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects invalid sort values at the zod boundary", async () => {
    const { setSubscriptionSort } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await setSubscriptionSort(
      "not-a-real-sort" as unknown as "title-asc",
    );

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/invalid/i),
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("merges the new sort into existing preferences without wiping other keys", async () => {
    const { revalidatePath } = await import("next/cache");
    mockFindFirstUser.mockResolvedValue({
      preferences: {
        theme: "dark",
        notifications: true,
        digestFrequency: "weekly",
      },
    });

    const { setSubscriptionSort } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await setSubscriptionSort("title-asc");

    expect(result).toEqual({ success: true });
    expect(revalidatePath).toHaveBeenCalledWith("/subscriptions");
    expect(mockUpdateSet).toHaveBeenCalledWith({
      preferences: {
        theme: "dark",
        notifications: true,
        digestFrequency: "weekly",
        subscriptionSort: "title-asc",
      },
    });
  });

  it("handles null preferences (new user) by seeding just the sort key", async () => {
    mockFindFirstUser.mockResolvedValue({ preferences: null });

    const { setSubscriptionSort } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await setSubscriptionSort("recently-listened");

    expect(result).toEqual({ success: true });
    expect(mockUpdateSet).toHaveBeenCalledWith({
      preferences: { subscriptionSort: "recently-listened" },
    });
  });

  it("returns error envelope on database failure", async () => {
    mockFindFirstUser.mockRejectedValue(new Error("db exploded"));

    const { setSubscriptionSort } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await setSubscriptionSort("title-asc");

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/failed to save/i),
    });
  });
});
