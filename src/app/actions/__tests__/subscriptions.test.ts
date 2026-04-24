import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEFAULT_SUBSCRIPTION_SORT } from "@/db/subscription-sorts";

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
      podcasts: {
        findFirst: (...args: unknown[]) => mockFindFirstPodcast(...args),
      },
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

// Mock schema — just need the table references. `SUBSCRIPTION_SORTS` /
// `DEFAULT_SUBSCRIPTION_SORT` come from the unmocked `@/db/subscription-sorts`
// module so adding a new sort value here can't silently desync the mock.
vi.mock("@/db/schema", async () => {
  const sorts = await vi.importActual<typeof import("@/db/subscription-sorts")>(
    "@/db/subscription-sorts",
  );
  return {
    users: { id: "id", preferences: "preferences" },
    podcasts: {
      id: "id",
      podcastIndexId: "podcast_index_id",
      title: "title",
      latestEpisodeDate: "latest_episode_date",
      description: "description",
      imageUrl: "image_url",
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
    SUBSCRIPTION_SORTS: sorts.SUBSCRIPTION_SORTS,
    DEFAULT_SUBSCRIPTION_SORT: sorts.DEFAULT_SUBSCRIPTION_SORT,
  };
});

// Mock drizzle-orm — capture orderBy/join args to assert sort wiring
const sqlTemplate = (strings: TemplateStringsArray, ...values: unknown[]) => {
  const result: {
    strings: TemplateStringsArray;
    values: unknown[];
    alias?: string;
  } = {
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

    const { addPodcastByRssUrl } = await import("@/app/actions/subscriptions");
    const result = await addPodcastByRssUrl("https://example.com/feed.xml");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/signed in/i);
  });

  it("returns error for invalid URL", async () => {
    mockIsSafeUrl.mockResolvedValueOnce(false);
    const { addPodcastByRssUrl } = await import("@/app/actions/subscriptions");
    const result = await addPodcastByRssUrl("not-a-url");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/valid and safe RSS feed URL/i);
  });

  it("returns error for empty URL", async () => {
    mockIsSafeUrl.mockResolvedValueOnce(false);
    const { addPodcastByRssUrl } = await import("@/app/actions/subscriptions");
    const result = await addPodcastByRssUrl("");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/valid and safe RSS feed URL/i);
  });

  it("returns error for non-http URL", async () => {
    mockIsSafeUrl.mockResolvedValueOnce(false);
    const { addPodcastByRssUrl } = await import("@/app/actions/subscriptions");
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

    const { addPodcastByRssUrl } = await import("@/app/actions/subscriptions");
    const result = await addPodcastByRssUrl("https://example.com/feed.xml");

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/already subscribed/i);
    expect(result.title).toBe("Existing Podcast");
    expect(mockParsePodcastFeed).not.toHaveBeenCalled();
  });

  it("returns error when feed parsing fails", async () => {
    mockParsePodcastFeed.mockRejectedValue(new Error("Invalid XML"));

    const { addPodcastByRssUrl } = await import("@/app/actions/subscriptions");
    const result = await addPodcastByRssUrl("https://example.com/bad-feed.xml");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/could not parse/i);
  });

  it("successfully imports a podcast and returns metadata", async () => {
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

    const { addPodcastByRssUrl } = await import("@/app/actions/subscriptions");
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
    mockReturning
      .mockReturnValueOnce([{ id: 1 }])
      .mockReturnValueOnce([{ id: 2 }]);

    const { subscribeToPodcast } = await import("@/app/actions/subscriptions");
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
    mockReturning.mockReturnValueOnce([{ id: 1 }]).mockReturnValueOnce([]);

    const { subscribeToPodcast } = await import("@/app/actions/subscriptions");
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

    const { isSubscribedToPodcast } =
      await import("@/app/actions/subscriptions");
    const result = await isSubscribedToPodcast("12345");

    expect(result).toBe(false);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns true when user is subscribed", async () => {
    mockSelectChain([{ exists: 1 }]);

    const { isSubscribedToPodcast } =
      await import("@/app/actions/subscriptions");
    const result = await isSubscribedToPodcast("12345");

    expect(result).toBe(true);
    expect(mockSelect).toHaveBeenCalled();
  });

  it("returns false when user is not subscribed", async () => {
    mockSelectChain([]);

    const { isSubscribedToPodcast } =
      await import("@/app/actions/subscriptions");
    const result = await isSubscribedToPodcast("12345");

    expect(result).toBe(false);
    expect(mockSelect).toHaveBeenCalled();
  });

  it("returns false on database error", async () => {
    mockSelect.mockImplementation(() => {
      throw new Error("DB connection failed");
    });

    const { isSubscribedToPodcast } =
      await import("@/app/actions/subscriptions");
    const result = await isSubscribedToPodcast("12345");

    expect(result).toBe(false);
  });
});

// Chain shape: select → from → innerJoin [→ leftJoin if recentlyListened] → where → orderBy → Promise<rows>
function makeSubsListChain(
  rows: unknown[],
  { recentlyListened = false }: { recentlyListened?: boolean } = {},
) {
  const mockOrderBy = vi.fn().mockResolvedValue(rows);
  const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
  const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
  const mockInnerJoin = vi
    .fn()
    .mockReturnValue(
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

// Chain shape: select → from → innerJoin → where → groupBy → as → opaque subquery token
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

// orderBy args captured when `getUserSubscriptions` resolves to the default
// sort: desc(isPinned), desc(subscribedAt).
const DEFAULT_ORDER_BY = [
  { __op: "desc", col: "is_pinned" },
  { __op: "desc", col: "subscribed_at" },
];

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

    const { getUserSubscriptions } =
      await import("@/app/actions/subscriptions");
    const result = await getUserSubscriptions();

    expect(result.subscriptions).toEqual([]);
    expect(result.error).toMatch(/signed in/i);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("uses recently-added default when no arg and no stored preference", async () => {
    const { chain, mocks } = makeSubsListChain([]);
    mockSelect.mockReturnValue(chain);

    const { getUserSubscriptions } =
      await import("@/app/actions/subscriptions");
    await getUserSubscriptions();

    expect(mocks.mockOrderBy).toHaveBeenCalledWith(...DEFAULT_ORDER_BY);
    expect(mocks.mockLeftJoin).not.toHaveBeenCalled();
  });

  it("uses stored preference when no sort arg provided", async () => {
    mockFindFirstUser.mockResolvedValue({
      preferences: { subscriptionSort: "title-asc" },
    });
    const { chain, mocks } = makeSubsListChain([]);
    mockSelect.mockReturnValue(chain);

    const { getUserSubscriptions } =
      await import("@/app/actions/subscriptions");
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

    const { getUserSubscriptions } =
      await import("@/app/actions/subscriptions");
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

    const { getUserSubscriptions } =
      await import("@/app/actions/subscriptions");
    await getUserSubscriptions();

    expect(mocks.mockOrderBy).toHaveBeenCalledWith(...DEFAULT_ORDER_BY);
  });

  it("recently-listened path builds a leftJoin on a grouped subquery", async () => {
    const subqueryChain = makeLastListenedSubqueryChain();
    const main = makeSubsListChain([], { recentlyListened: true });
    mockSelect
      .mockReturnValueOnce(subqueryChain)
      .mockReturnValueOnce(main.chain);

    const { getUserSubscriptions } =
      await import("@/app/actions/subscriptions");
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

    const { getUserSubscriptions } =
      await import("@/app/actions/subscriptions");
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

    const { getUserSubscriptions } =
      await import("@/app/actions/subscriptions");
    const result = await getUserSubscriptions();

    expect(result.subscriptions).toEqual([]);
    expect(result.error).toMatch(/failed to load/i);
  });

  it("falls back to default sort when the preference read throws", async () => {
    // A transient failure reading preferences must NOT nuke the list.
    mockFindFirstUser.mockRejectedValue(new Error("prefs read hiccup"));
    const { chain, mocks } = makeSubsListChain([]);
    mockSelect.mockReturnValue(chain);

    const { getUserSubscriptions } =
      await import("@/app/actions/subscriptions");
    const result = await getUserSubscriptions();

    expect(result.error).toBeNull();
    expect(mocks.mockOrderBy).toHaveBeenCalledWith(...DEFAULT_ORDER_BY);
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

    const { togglePinSubscription } =
      await import("@/app/actions/subscriptions");
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
      const { togglePinSubscription } =
        await import("@/app/actions/subscriptions");
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

    const { togglePinSubscription } =
      await import("@/app/actions/subscriptions");
    const result = await togglePinSubscription(999);

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/not found/i),
    });
  });

  it("returns the new isPinned state from RETURNING and calls revalidatePath", async () => {
    const { revalidatePath } = await import("next/cache");
    mockUpdateReturning.mockResolvedValue([{ isPinned: true }]);

    const { togglePinSubscription } =
      await import("@/app/actions/subscriptions");
    const result = await togglePinSubscription(42);

    expect(result).toEqual({ success: true, data: { isPinned: true } });
    expect(revalidatePath).toHaveBeenCalledWith("/subscriptions");
    // The set() call receives an sql-tagged template, not a JS boolean
    expect(mockUpdateSet).toHaveBeenCalledTimes(1);
    const setArg = mockUpdateSet.mock.calls[0][0] as { isPinned: unknown };
    expect(typeof setArg.isPinned).not.toBe("boolean");
    expect(setArg.isPinned).toMatchObject({ strings: expect.any(Object) });
  });

  it("scopes the UPDATE to the current user (ownership regression guard)", async () => {
    mockUpdateReturning.mockResolvedValue([{ isPinned: true }]);

    const { togglePinSubscription } =
      await import("@/app/actions/subscriptions");
    await togglePinSubscription(42);

    // WHERE must be an and(eq(id, 42), eq(user_id, userId)) — dropping the
    // userId predicate would let one user flip another user's subscription.
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
    const whereArg = mockUpdateWhere.mock.calls[0][0] as {
      __op: string;
      args: Array<{ __op: string; a: unknown; b: unknown }>;
    };
    expect(whereArg.__op).toBe("and");
    const cols = whereArg.args.map((p) => p.a);
    expect(cols).toContain("id");
    expect(cols).toContain("user_id");
    const userIdPredicate = whereArg.args.find((p) => p.a === "user_id");
    expect(userIdPredicate?.b).toBe("user_123");
  });

  it("returns error envelope on database failure", async () => {
    mockUpdateReturning.mockRejectedValue(new Error("db exploded"));

    const { togglePinSubscription } =
      await import("@/app/actions/subscriptions");
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
    // Short-circuit ensureUserExists: if the row already has an email, it early-returns.
    mockFindFirstUser.mockResolvedValue({ email: "test@example.com" });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns error when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { setSubscriptionSort } = await import("@/app/actions/subscriptions");
    const result = await setSubscriptionSort("title-asc");

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/signed in/i),
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects invalid sort values at the zod boundary", async () => {
    const { setSubscriptionSort } = await import("@/app/actions/subscriptions");
    const result = await setSubscriptionSort(
      "not-a-real-sort" as unknown as "title-asc",
    );

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/invalid/i),
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("emits an atomic jsonb_set UPDATE with the new sort and touches updatedAt", async () => {
    const { revalidatePath } = await import("next/cache");

    const { setSubscriptionSort } = await import("@/app/actions/subscriptions");
    const result = await setSubscriptionSort("title-asc");

    expect(result).toEqual({ success: true });
    expect(revalidatePath).toHaveBeenCalledWith("/subscriptions");
    expect(mockUpdateSet).toHaveBeenCalledTimes(1);
    const setArg = mockUpdateSet.mock.calls[0][0] as {
      preferences: { strings: TemplateStringsArray; values: unknown[] };
      updatedAt: unknown;
    };
    // The preferences value is an sql-tagged template (atomic merge at the DB layer),
    // NOT a pre-merged plain object (which would race with other preference writers).
    expect(setArg.preferences).toMatchObject({ strings: expect.any(Object) });
    expect(setArg.preferences.values).toContain("title-asc");
    // Second positional arg in the template is the sort; first is the column ref.
    // Rebuild SQL text to confirm jsonb_set is actually what's emitted.
    expect(Array.from(setArg.preferences.strings).join("?")).toMatch(
      /jsonb_set/,
    );
    expect(setArg.updatedAt).toBeInstanceOf(Date);
  });

  it("calls ensureUserExists before the UPDATE so first-session writes can't silently no-op", async () => {
    // mockFindFirstUser is consulted by ensureUserExists (looking for an email).
    // If the row doesn't exist yet, ensureUserExists would fall through to an
    // insert; either way, it must run before the preferences UPDATE.
    mockFindFirstUser.mockResolvedValueOnce({ email: "already@exists.com" });

    const { setSubscriptionSort } = await import("@/app/actions/subscriptions");
    await setSubscriptionSort("title-asc");

    expect(mockFindFirstUser).toHaveBeenCalled();
    // And then the UPDATE fired.
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("returns error envelope when ensureUserExists throws", async () => {
    mockFindFirstUser.mockRejectedValue(new Error("db exploded"));

    const { setSubscriptionSort } = await import("@/app/actions/subscriptions");
    const result = await setSubscriptionSort("title-asc");

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/failed to save/i),
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("getUserSubscriptionSort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_123" });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns default sort when not authenticated (no DB read)", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { getUserSubscriptionSort } =
      await import("@/app/actions/subscriptions");
    const result = await getUserSubscriptionSort();

    expect(result).toBe(DEFAULT_SUBSCRIPTION_SORT);
    expect(mockFindFirstUser).not.toHaveBeenCalled();
  });

  it("returns default sort when preferences row is null", async () => {
    mockFindFirstUser.mockResolvedValue({ preferences: null });

    const { getUserSubscriptionSort } =
      await import("@/app/actions/subscriptions");
    const result = await getUserSubscriptionSort();

    expect(result).toBe(DEFAULT_SUBSCRIPTION_SORT);
    expect(mockFindFirstUser).toHaveBeenCalledTimes(1);
  });

  it("returns the stored preference when present and valid", async () => {
    mockFindFirstUser.mockResolvedValue({
      preferences: { subscriptionSort: "latest-episode" },
    });

    const { getUserSubscriptionSort } =
      await import("@/app/actions/subscriptions");
    const result = await getUserSubscriptionSort();

    expect(result).toBe("latest-episode");
  });

  it("falls back to default when the preference read throws", async () => {
    mockFindFirstUser.mockRejectedValue(new Error("prefs read hiccup"));

    const { getUserSubscriptionSort } =
      await import("@/app/actions/subscriptions");
    const result = await getUserSubscriptionSort();

    expect(result).toBe(DEFAULT_SUBSCRIPTION_SORT);
  });
});

// Chain shape: select → from → innerJoin → where → orderBy → Promise<rows>
function makePinnedListChain(rows: unknown[]) {
  const mockOrderBy = vi.fn().mockResolvedValue(rows);
  const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
  const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
  const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
  return {
    chain: { from: mockFrom },
    mocks: { mockFrom, mockInnerJoin, mockWhere, mockOrderBy },
  };
}

describe("getPinnedSubscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user_123" });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns error when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { getPinnedSubscriptions } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await getPinnedSubscriptions();

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/signed in/i),
    });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns empty array when user has no pinned subscriptions", async () => {
    const { chain } = makePinnedListChain([]);
    mockSelect.mockReturnValue(chain);

    const { getPinnedSubscriptions } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await getPinnedSubscriptions();

    expect(result).toEqual({ success: true, data: [] });
  });

  it("returns single pin with correct fields and no extras", async () => {
    const row = {
      id: 1,
      podcastId: 10,
      podcastIndexId: "pi-10",
      title: "Solo",
      imageUrl: "https://img/1.png",
    };
    const { chain } = makePinnedListChain([row]);
    mockSelect.mockReturnValue(chain);

    const { getPinnedSubscriptions } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await getPinnedSubscriptions();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual({
      id: 1,
      podcastId: 10,
      podcastIndexId: "pi-10",
      title: "Solo",
      imageUrl: "https://img/1.png",
    });
    const projection = mockSelect.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(projection).sort()).toEqual(
      ["id", "imageUrl", "podcastId", "podcastIndexId", "title"],
    );
  });

  it("orders by podcasts.title ASC — passes DB-sorted rows through unchanged", async () => {
    const rows = [
      { id: 1, podcastId: 10, podcastIndexId: "pi-10", title: "Apple Pod", imageUrl: "https://img/10.png" },
      { id: 2, podcastId: 20, podcastIndexId: "pi-20", title: "Mango Pod", imageUrl: null },
      { id: 3, podcastId: 30, podcastIndexId: "pi-30", title: "Zebra Pod", imageUrl: "https://img/30.png" },
    ];
    const { chain, mocks } = makePinnedListChain(rows);
    mockSelect.mockReturnValue(chain);

    const { getPinnedSubscriptions } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await getPinnedSubscriptions();

    expect(mocks.mockOrderBy).toHaveBeenCalledTimes(1);
    expect(mocks.mockOrderBy).toHaveBeenCalledWith(
      { __op: "asc", col: "title" },
      { __op: "asc", col: "id" },
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.map((r) => r.title)).toEqual(["Apple Pod", "Mango Pod", "Zebra Pod"]);
  });

  it("does not re-sort DB results client-side (non-alphabetical seed)", async () => {
    const unsortedRows = [
      { id: 3, podcastId: 30, podcastIndexId: "pi-30", title: "Zebra Pod", imageUrl: null },
      { id: 1, podcastId: 10, podcastIndexId: "pi-10", title: "Apple Pod", imageUrl: null },
      { id: 2, podcastId: 20, podcastIndexId: "pi-20", title: "Mango Pod", imageUrl: null },
    ];
    const { chain } = makePinnedListChain(unsortedRows);
    mockSelect.mockReturnValue(chain);

    const { getPinnedSubscriptions } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await getPinnedSubscriptions();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.map((r) => r.title)).toEqual(["Zebra Pod", "Apple Pod", "Mango Pod"]);
  });

  it("WHERE includes isPinned=true and userId predicates", async () => {
    const { chain, mocks } = makePinnedListChain([]);
    mockSelect.mockReturnValue(chain);

    const { getPinnedSubscriptions } = await import(
      "@/app/actions/subscriptions"
    );
    await getPinnedSubscriptions();

    expect(mocks.mockWhere).toHaveBeenCalledTimes(1);
    const whereArg = mocks.mockWhere.mock.calls[0][0] as {
      __op: string;
      args: Array<{ __op: string; a: unknown; b: unknown }>;
    };
    expect(whereArg.__op).toBe("and");
    expect(whereArg.args).toHaveLength(2);
    const userIdPredicate = whereArg.args.find((p) => p.a === "user_id");
    const isPinnedPredicate = whereArg.args.find((p) => p.a === "is_pinned");
    expect(userIdPredicate?.b).toBe("user_123");
    expect(isPinnedPredicate?.b).toBe(true);
  });

  it("returns error envelope on database failure", async () => {
    mockSelect.mockImplementation(() => {
      throw new Error("db exploded");
    });

    const { getPinnedSubscriptions } = await import(
      "@/app/actions/subscriptions"
    );
    const result = await getPinnedSubscriptions();

    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/failed to load/i),
    });
  });
});
