import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock DB — separate mock functions per operation to avoid order-dependent fragility
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockEpisodesFindFirst = vi.fn();
const mockPodcastsFindFirst = vi.fn();

vi.mock("@/db", () => ({
  db: {
    update: (...args: unknown[]) => mockUpdate(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
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
  episodeTopics: { episodeId: "episodeId", topic: "topic", relevance: "relevance" },
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
function makeInsertChain(returningValue: unknown[] = [{ id: 42 }]) {
  const chain = {
    values: vi.fn(),
    onConflictDoNothing: vi.fn(),
    returning: vi.fn(),
  };
  chain.values.mockReturnValue(chain);
  chain.returning.mockResolvedValue(returningValue);
  chain.onConflictDoNothing.mockResolvedValue(undefined);
  return chain;
}

// Chainable delete builder
function makeDeleteChain() {
  const chain = { where: vi.fn() };
  chain.where.mockResolvedValue(undefined);
  mockDelete.mockReturnValue(chain);
  return chain;
}

// Lightweight update chain (no .returning) — used when only .set/.where are needed
function makeSimpleUpdateChain() {
  const chain = { set: vi.fn(), where: vi.fn() };
  chain.set.mockReturnValue(chain);
  chain.where.mockResolvedValue(undefined);
  mockUpdate.mockReturnValue(chain);
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
        transcriptRunId: null,
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

describe("persistEpisodeSummary", () => {
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

  it("updates summary fields and sets summaryStatus to 'completed' (update path)", async () => {
    mockPodcastsFindFirst.mockResolvedValue({ id: 1 });
    mockEpisodesFindFirst.mockResolvedValue({ id: 10 });
    const chain = makeSimpleUpdateChain();

    const { persistEpisodeSummary } = await import("@/trigger/helpers/database");
    await persistEpisodeSummary(baseEpisode as never, undefined, baseSummary);

    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "Summary text",
        summaryStatus: "completed",
        summaryRunId: null,
      })
    );
  });

  it("does NOT write transcript-related columns in the update path", async () => {
    mockPodcastsFindFirst.mockResolvedValue({ id: 1 });
    mockEpisodesFindFirst.mockResolvedValue({ id: 10 });
    const chain = makeSimpleUpdateChain();

    const { persistEpisodeSummary } = await import("@/trigger/helpers/database");
    await persistEpisodeSummary(baseEpisode as never, undefined, baseSummary);

    const setArgs = chain.set.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.hasOwn(setArgs, "transcription")).toBe(false);
    expect(Object.hasOwn(setArgs, "transcriptSource")).toBe(false);
    expect(Object.hasOwn(setArgs, "transcriptStatus")).toBe(false);
    expect(Object.hasOwn(setArgs, "transcriptError")).toBe(false);
    expect(Object.hasOwn(setArgs, "transcriptFetchedAt")).toBe(false);
  });

  it("inserts summary fields and sets summaryStatus to 'completed' (insert path)", async () => {
    mockPodcastsFindFirst.mockResolvedValue({ id: 1 });
    mockEpisodesFindFirst.mockResolvedValue(null);

    const episodesChain = makeInsertChain([{ id: 42 }]);
    mockInsert.mockReturnValue(episodesChain);

    const { persistEpisodeSummary } = await import("@/trigger/helpers/database");
    await persistEpisodeSummary(baseEpisode as never, undefined, baseSummary);

    expect(episodesChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "Summary text",
        summaryStatus: "completed",
      })
    );
    expect(episodesChain.returning).toHaveBeenCalled();
  });

  it("does NOT write transcript-related columns in the insert path", async () => {
    mockPodcastsFindFirst.mockResolvedValue({ id: 1 });
    mockEpisodesFindFirst.mockResolvedValue(null);

    const chain = makeInsertChain([{ id: 42 }]);
    mockInsert.mockReturnValue(chain);

    const { persistEpisodeSummary } = await import("@/trigger/helpers/database");
    await persistEpisodeSummary(baseEpisode as never, undefined, baseSummary);

    const valuesArgs = chain.values.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.hasOwn(valuesArgs, "transcription")).toBe(false);
    expect(Object.hasOwn(valuesArgs, "transcriptSource")).toBe(false);
    expect(Object.hasOwn(valuesArgs, "transcriptStatus")).toBe(false);
    expect(Object.hasOwn(valuesArgs, "transcriptError")).toBe(false);
    expect(Object.hasOwn(valuesArgs, "transcriptFetchedAt")).toBe(false);
  });

  it("throws when podcast cannot be resolved", async () => {
    mockPodcastsFindFirst.mockResolvedValue(null);

    const { persistEpisodeSummary } = await import("@/trigger/helpers/database");
    await expect(
      persistEpisodeSummary(baseEpisode as never, undefined, baseSummary)
    ).rejects.toThrow("Could not find or create podcast in database");
  });

  describe("topic persistence", () => {
    const summaryWithTopics = {
      ...baseSummary,
      topics: [
        { name: "AI & Machine Learning", relevance: 0.9 },
        { name: "Data Science", relevance: 0.75 },
      ],
    };

    it("deletes existing topics then inserts new ones on the update path", async () => {
      mockPodcastsFindFirst.mockResolvedValue({ id: 1 });
      mockEpisodesFindFirst.mockResolvedValue({ id: 10 });
      makeSimpleUpdateChain();
      makeDeleteChain();

      const topicsChain = makeInsertChain([]);
      mockInsert.mockReturnValue(topicsChain);

      const { persistEpisodeSummary } = await import("@/trigger/helpers/database");
      await persistEpisodeSummary(baseEpisode as never, undefined, summaryWithTopics);

      expect(mockDelete).toHaveBeenCalledTimes(1);
      expect(mockInsert).toHaveBeenCalledTimes(1);
      expect(topicsChain.values).toHaveBeenCalledWith([
        { episodeId: 10, topic: "AI & Machine Learning", relevance: "0.90" },
        { episodeId: 10, topic: "Data Science", relevance: "0.75" },
      ]);
    });

    it("deletes existing topics then inserts using the returned id on the insert path", async () => {
      mockPodcastsFindFirst.mockResolvedValue({ id: 1 });
      mockEpisodesFindFirst.mockResolvedValue(null);

      makeDeleteChain();
      const episodesChain = makeInsertChain([{ id: 42 }]);
      const topicsChain = makeInsertChain([]);
      mockInsert.mockReturnValueOnce(episodesChain).mockReturnValueOnce(topicsChain);

      const { persistEpisodeSummary } = await import("@/trigger/helpers/database");
      await persistEpisodeSummary(baseEpisode as never, undefined, summaryWithTopics);

      expect(episodesChain.returning).toHaveBeenCalled();
      expect(mockDelete).toHaveBeenCalledTimes(1);
      expect(topicsChain.values).toHaveBeenCalledWith([
        { episodeId: 42, topic: "AI & Machine Learning", relevance: "0.90" },
        { episodeId: 42, topic: "Data Science", relevance: "0.75" },
      ]);
    });

    it("does not delete or insert topics when topics array is empty", async () => {
      mockPodcastsFindFirst.mockResolvedValue({ id: 1 });
      mockEpisodesFindFirst.mockResolvedValue({ id: 10 });
      makeSimpleUpdateChain();

      const { persistEpisodeSummary } = await import("@/trigger/helpers/database");
      await persistEpisodeSummary(baseEpisode as never, undefined, { ...baseSummary, topics: [] });

      expect(mockDelete).not.toHaveBeenCalled();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("does not delete or insert topics when topics is undefined", async () => {
      mockPodcastsFindFirst.mockResolvedValue({ id: 1 });
      mockEpisodesFindFirst.mockResolvedValue({ id: 10 });
      makeSimpleUpdateChain();

      const { persistEpisodeSummary } = await import("@/trigger/helpers/database");
      await persistEpisodeSummary(baseEpisode as never, undefined, baseSummary);

      expect(mockDelete).not.toHaveBeenCalled();
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });
});
