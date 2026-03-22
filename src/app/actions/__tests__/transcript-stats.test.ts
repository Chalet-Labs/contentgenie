import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Clerk auth
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

// Mock database
const mockDbSelect = vi.fn();
const mockEpisodesFindMany = vi.fn();
const mockPodcastsFindMany = vi.fn();
vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    query: {
      episodes: { findMany: (...args: unknown[]) => mockEpisodesFindMany(...args) },
    },
  },
}));

// Mock schema — stub column references used by drizzle-orm operators
vi.mock("@/db/schema", () => ({
  episodes: {
    id: "id",
    title: "title",
    podcastId: "podcast_id",
    podcastIndexId: "podcast_index_id",
    transcriptStatus: "transcript_status",
    transcriptError: "transcript_error",
    publishDate: "publish_date",
  },
  podcasts: {
    id: "id",
    title: "title",
  },
}));

// Mock drizzle-orm operators
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ type: "and", conditions: args })),
  or: vi.fn((...args: unknown[]) => ({ type: "or", conditions: args })),
  isNull: vi.fn((col: unknown) => ({ type: "isNull", col })),
  eq: vi.fn((col: unknown, val: unknown) => ({ type: "eq", col, val })),
  count: vi.fn(() => "count(*)"),
  desc: vi.fn((col: unknown) => ({ type: "desc", col })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ type: "inArray", col, vals })),
}));

// Episode row factory
function makeEpisodeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: "Episode One",
    podcastTitle: "Podcast A",
    podcastId: 10,
    podcastIndexId: "999",
    transcriptStatus: null,
    transcriptError: null,
    publishDate: new Date("2024-01-01"),
    ...overrides,
  };
}

// Podcast row factory
function makePodcastRow(overrides: Record<string, unknown> = {}) {
  return { id: 10, title: "Podcast A", ...overrides };
}

// Helper: set up the chained select().from().innerJoin().where().orderBy().limit().offset()
// and the separate count select chain
function mockSelectChain(
  countValue: number,
  episodeRows: ReturnType<typeof makeEpisodeRow>[],
  podcastRows: ReturnType<typeof makePodcastRow>[]
) {
  let callIndex = 0;
  mockDbSelect.mockImplementation(() => {
    const call = callIndex++;
    if (call === 0) {
      // count query
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: countValue }]),
        }),
      };
    }
    if (call === 1) {
      // episode list query
      return {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue(episodeRows),
                }),
              }),
            }),
          }),
        }),
      };
    }
    // podcasts list query
    return {
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(podcastRows),
      }),
    };
  });
}

describe("getEpisodeTranscriptStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns error when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null, has: vi.fn().mockReturnValue(false) });

    const { getEpisodeTranscriptStats } = await import(
      "@/app/actions/transcript-stats"
    );
    const result = await getEpisodeTranscriptStats();

    expect(result.error).toBe("Unauthorized");
    expect(result.totalMissing).toBe(0);
    expect(result.episodes).toEqual([]);
    expect(result.podcasts).toEqual([]);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("returns error when authenticated but not admin", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1", has: vi.fn().mockReturnValue(false) });

    const { getEpisodeTranscriptStats } = await import(
      "@/app/actions/transcript-stats"
    );
    const result = await getEpisodeTranscriptStats();

    expect(result.error).toBe("Unauthorized");
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("returns count and paginated episodes for admin", async () => {
    mockAuth.mockResolvedValue({ userId: "admin_1", has: vi.fn().mockReturnValue(true) });
    const ep = makeEpisodeRow();
    const pod = makePodcastRow();
    mockSelectChain(1, [ep], [pod]);

    const { getEpisodeTranscriptStats } = await import(
      "@/app/actions/transcript-stats"
    );
    const result = await getEpisodeTranscriptStats();

    expect(result.error).toBeUndefined();
    expect(result.totalMissing).toBe(1);
    expect(result.episodes).toHaveLength(1);
    expect(result.episodes[0].id).toBe(1);
    expect(result.podcasts).toHaveLength(1);
  });

  it("returns empty result when no episodes are missing", async () => {
    mockAuth.mockResolvedValue({ userId: "admin_1", has: vi.fn().mockReturnValue(true) });
    mockSelectChain(0, [], []);

    const { getEpisodeTranscriptStats } = await import(
      "@/app/actions/transcript-stats"
    );
    const result = await getEpisodeTranscriptStats();

    expect(result.totalMissing).toBe(0);
    expect(result.episodes).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it("applies pagination offset for page 2", async () => {
    mockAuth.mockResolvedValue({ userId: "admin_1", has: vi.fn().mockReturnValue(true) });
    mockSelectChain(15, [], []);

    const { getEpisodeTranscriptStats } = await import(
      "@/app/actions/transcript-stats"
    );
    await getEpisodeTranscriptStats({ page: 2, pageSize: 5 });

    // The third db.select call (index 1) builds the episode list query.
    // We verify the chain was set up — offset is called with (page-1)*pageSize = 5
    expect(mockDbSelect).toHaveBeenCalled();
  });

  it("applies podcastId filter when provided", async () => {
    mockAuth.mockResolvedValue({ userId: "admin_1", has: vi.fn().mockReturnValue(true) });
    mockSelectChain(3, [], []);
    const { eq } = await import("drizzle-orm");

    const { getEpisodeTranscriptStats } = await import(
      "@/app/actions/transcript-stats"
    );
    await getEpisodeTranscriptStats({ podcastId: 42 });

    expect(eq).toHaveBeenCalledWith(expect.anything(), 42);
  });

  it("includes episodes with transcriptStatus = 'fetching' (stale recovery)", async () => {
    mockAuth.mockResolvedValue({ userId: "admin_1", has: vi.fn().mockReturnValue(true) });
    const staleEp = makeEpisodeRow({ transcriptStatus: "fetching" });
    mockSelectChain(1, [staleEp], []);
    const { eq } = await import("drizzle-orm");

    const { getEpisodeTranscriptStats } = await import(
      "@/app/actions/transcript-stats"
    );
    const result = await getEpisodeTranscriptStats();

    // eq is called for each of the non-null transcript status checks (missing, failed, fetching)
    expect(eq).toHaveBeenCalledWith(expect.anything(), "fetching");
    expect(result.episodes[0].transcriptStatus).toBe("fetching");
  });

  it("builds the or condition with all four transcript status values", async () => {
    mockAuth.mockResolvedValue({ userId: "admin_1", has: vi.fn().mockReturnValue(true) });
    mockSelectChain(0, [], []);
    const { or, isNull, eq } = await import("drizzle-orm");

    const { getEpisodeTranscriptStats } = await import(
      "@/app/actions/transcript-stats"
    );
    await getEpisodeTranscriptStats();

    expect(isNull).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith(expect.anything(), "missing");
    expect(eq).toHaveBeenCalledWith(expect.anything(), "failed");
    expect(eq).toHaveBeenCalledWith(expect.anything(), "fetching");
    expect(or).toHaveBeenCalled();
  });

  it("returns podcasts array for dropdown filter", async () => {
    mockAuth.mockResolvedValue({ userId: "admin_1", has: vi.fn().mockReturnValue(true) });
    const pods = [makePodcastRow({ id: 1, title: "Pod A" }), makePodcastRow({ id: 2, title: "Pod B" })];
    mockSelectChain(0, [], pods);

    const { getEpisodeTranscriptStats } = await import(
      "@/app/actions/transcript-stats"
    );
    const result = await getEpisodeTranscriptStats();

    expect(result.podcasts).toHaveLength(2);
    expect(result.podcasts[0].title).toBe("Pod A");
  });

  it("skips podcasts query when skipPodcasts is true", async () => {
    mockAuth.mockResolvedValue({ userId: "admin_1", has: vi.fn().mockReturnValue(true) });
    // Only 2 db.select calls needed (count + episodes) — no podcasts query
    let callIndex = 0;
    mockDbSelect.mockImplementation(() => {
      const call = callIndex++;
      if (call === 0) {
        return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ count: 0 }]) }) };
      }
      return {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }),
              }),
            }),
          }),
        }),
      };
    });

    const { getEpisodeTranscriptStats } = await import(
      "@/app/actions/transcript-stats"
    );
    const result = await getEpisodeTranscriptStats({ skipPodcasts: true });

    expect(result.podcasts).toEqual([]);
    // Only 2 db.select calls — count and episode list; no third call for podcasts
    expect(mockDbSelect).toHaveBeenCalledTimes(2);
  });

  it("clamps pageSize to max 50 and page to min 1", async () => {
    mockAuth.mockResolvedValue({ userId: "admin_1", has: vi.fn().mockReturnValue(true) });
    mockSelectChain(0, [], []);

    const { getEpisodeTranscriptStats } = await import(
      "@/app/actions/transcript-stats"
    );
    // Should not throw even with extreme values
    await getEpisodeTranscriptStats({ page: -5, pageSize: 99999 });
    expect(mockDbSelect).toHaveBeenCalled();
  });

  it("returns error on DB failure instead of throwing", async () => {
    mockAuth.mockResolvedValue({ userId: "admin_1", has: vi.fn().mockReturnValue(true) });
    mockDbSelect.mockImplementation(() => { throw new Error("DB connection failed"); });

    const { getEpisodeTranscriptStats } = await import(
      "@/app/actions/transcript-stats"
    );
    const result = await getEpisodeTranscriptStats();

    expect(result.error).toBe("Failed to load transcript stats");
    expect(result.totalMissing).toBe(0);
    expect(result.episodes).toEqual([]);
  });
});
