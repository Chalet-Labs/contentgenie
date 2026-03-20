import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock DB — separate mock functions per operation to avoid order-dependent fragility
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockEpisodesFindFirst = vi.fn();
const mockPodcastsFindFirst = vi.fn();

vi.mock("@/db", () => ({
  db: {
    update: (...args: unknown[]) => mockUpdate(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    query: {
      episodes: {
        findFirst: (...args: unknown[]) => mockEpisodesFindFirst(...args),
      },
      podcasts: {
        findFirst: (...args: unknown[]) => mockPodcastsFindFirst(...args),
      },
    },
  },
}));

vi.mock("@/db/schema", () => ({
  episodes: { podcastIndexId: "podcastIndexId", id: "id" },
  podcasts: { podcastIndexId: "podcastIndexId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
}));

// Mock upsertPodcast — not under test here
const mockUpsertPodcast = vi.fn();
vi.mock("@/db/helpers", () => ({
  upsertPodcast: (...args: unknown[]) => mockUpsertPodcast(...args),
}));

// Chainable update builder used across tests
function makeUpdateChain(returnValue: unknown) {
  const chain = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn(),
  };
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.returning.mockResolvedValue(returnValue);
  return chain;
}

// Chainable insert builder
function makeInsertChain() {
  const chain = {
    values: vi.fn(),
    onConflictDoNothing: vi.fn(),
  };
  chain.values.mockResolvedValue(undefined);
  chain.onConflictDoNothing.mockResolvedValue(undefined);
  return chain;
}

describe("persistTranscript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets transcriptStatus to 'available', transcriptFetchedAt, and clears transcriptError on success", async () => {
    const chain = makeUpdateChain([{ id: 1 }]);
    mockUpdate.mockReturnValue(chain);

    const { persistTranscript } = await import("@/trigger/helpers/database");
    await persistTranscript(12345, "Full transcript text", "podcastindex");

    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        transcription: "Full transcript text",
        transcriptSource: "podcastindex",
        transcriptStatus: "available",
        transcriptFetchedAt: expect.any(Date),
        transcriptError: null,
      })
    );
  });

  it("sets transcriptSource to the provided source value", async () => {
    const chain = makeUpdateChain([{ id: 2 }]);
    mockUpdate.mockReturnValue(chain);

    const { persistTranscript } = await import("@/trigger/helpers/database");
    await persistTranscript(99, "transcript", "assemblyai");

    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ transcriptSource: "assemblyai" })
    );
  });

  it("throws when episode is not found", async () => {
    const chain = makeUpdateChain([]); // empty returning = not found
    mockUpdate.mockReturnValue(chain);

    const { persistTranscript } = await import("@/trigger/helpers/database");
    await expect(
      persistTranscript(999, "text", "description-url")
    ).rejects.toThrow("Episode 999 not found for transcript persistence");
  });
});

describe("persistEpisodeSummary — transcript columns", () => {
  const baseSummary = {
    summary: "Summary text",
    keyTakeaways: ["point 1"],
    worthItScore: 7.5,
    worthItReason: "Good content",
    worthItDimensions: { uniqueness: 8, actionability: 7, timeValue: 7 },
  };

  const baseEpisode = {
    id: 42,
    feedId: 100,
    title: "Test Episode",
    description: "desc",
    enclosureUrl: "https://audio.example.com/ep.mp3",
    duration: 3600,
    datePublished: 1700000000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets transcriptStatus to 'available' when transcript is provided (update path)", async () => {
    mockPodcastsFindFirst.mockResolvedValue({ id: 1 });
    mockEpisodesFindFirst.mockResolvedValue({ id: 10 });

    const chain = {
      set: vi.fn(),
      where: vi.fn(),
    };
    chain.set.mockReturnValue(chain);
    chain.where.mockResolvedValue(undefined);
    mockUpdate.mockReturnValue(chain);

    const { persistEpisodeSummary } = await import("@/trigger/helpers/database");
    await persistEpisodeSummary(
      baseEpisode as never,
      undefined,
      baseSummary,
      "Transcript text",
      "podcastindex"
    );

    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        transcriptStatus: "available",
        transcriptError: null,
      })
    );
  });

  it("sets transcriptStatus to 'missing' when transcript is absent (update path)", async () => {
    mockPodcastsFindFirst.mockResolvedValue({ id: 1 });
    mockEpisodesFindFirst.mockResolvedValue({ id: 10 });

    const chain = {
      set: vi.fn(),
      where: vi.fn(),
    };
    chain.set.mockReturnValue(chain);
    chain.where.mockResolvedValue(undefined);
    mockUpdate.mockReturnValue(chain);

    const { persistEpisodeSummary } = await import("@/trigger/helpers/database");
    await persistEpisodeSummary(
      baseEpisode as never,
      undefined,
      baseSummary,
      undefined,
      null
    );

    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        transcriptStatus: "missing",
        transcriptError: null,
      })
    );
  });

  it("does NOT set transcriptFetchedAt in the update path", async () => {
    mockPodcastsFindFirst.mockResolvedValue({ id: 1 });
    mockEpisodesFindFirst.mockResolvedValue({ id: 10 });

    const chain = {
      set: vi.fn(),
      where: vi.fn(),
    };
    chain.set.mockReturnValue(chain);
    chain.where.mockResolvedValue(undefined);
    mockUpdate.mockReturnValue(chain);

    const { persistEpisodeSummary } = await import("@/trigger/helpers/database");
    await persistEpisodeSummary(
      baseEpisode as never,
      undefined,
      baseSummary,
      "transcript",
      "assemblyai"
    );

    const setArgs = chain.set.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.hasOwn(setArgs, "transcriptFetchedAt")).toBe(false);
  });

  it("sets transcriptFetchedAt to null in the insert path", async () => {
    mockPodcastsFindFirst.mockResolvedValue({ id: 1 });
    mockEpisodesFindFirst.mockResolvedValue(null); // no existing episode → insert path

    const chain = makeInsertChain();
    mockInsert.mockReturnValue(chain);

    const { persistEpisodeSummary } = await import("@/trigger/helpers/database");
    await persistEpisodeSummary(
      baseEpisode as never,
      undefined,
      baseSummary,
      "transcript",
      "podcastindex"
    );

    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        transcriptFetchedAt: null,
      })
    );
  });

  it("sets transcriptStatus to 'available' in the insert path when transcript is provided", async () => {
    mockPodcastsFindFirst.mockResolvedValue({ id: 1 });
    mockEpisodesFindFirst.mockResolvedValue(null);

    const chain = makeInsertChain();
    mockInsert.mockReturnValue(chain);

    const { persistEpisodeSummary } = await import("@/trigger/helpers/database");
    await persistEpisodeSummary(
      baseEpisode as never,
      undefined,
      baseSummary,
      "Transcript text",
      "assemblyai"
    );

    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        transcriptStatus: "available",
        transcriptFetchedAt: null,
      })
    );
  });

  it("sets transcriptStatus to 'missing' in the insert path when transcript is absent", async () => {
    mockPodcastsFindFirst.mockResolvedValue({ id: 1 });
    mockEpisodesFindFirst.mockResolvedValue(null);

    const chain = makeInsertChain();
    mockInsert.mockReturnValue(chain);

    const { persistEpisodeSummary } = await import("@/trigger/helpers/database");
    await persistEpisodeSummary(
      baseEpisode as never,
      undefined,
      baseSummary,
      undefined,
      null
    );

    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        transcriptStatus: "missing",
        transcriptFetchedAt: null,
      })
    );
  });

  it("only overwrites transcriptSource when explicitly provided (not undefined)", async () => {
    mockPodcastsFindFirst.mockResolvedValue({ id: 1 });
    mockEpisodesFindFirst.mockResolvedValue({ id: 10 });

    const chain = {
      set: vi.fn(),
      where: vi.fn(),
    };
    chain.set.mockReturnValue(chain);
    chain.where.mockResolvedValue(undefined);
    mockUpdate.mockReturnValue(chain);

    const { persistEpisodeSummary } = await import("@/trigger/helpers/database");
    // Pass transcriptSource as undefined — should NOT appear in updateFields
    await persistEpisodeSummary(
      baseEpisode as never,
      undefined,
      baseSummary,
      "transcript"
      // transcriptSource omitted → undefined
    );

    const setArgs = chain.set.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.hasOwn(setArgs, "transcriptSource")).toBe(false);
  });
});
