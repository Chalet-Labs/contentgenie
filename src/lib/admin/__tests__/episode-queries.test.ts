import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  episodes: {
    id: "id",
    title: "title",
    podcastId: "podcast_id",
    podcastIndexId: "podcast_index_id",
    publishDate: "publish_date",
    transcriptStatus: "transcript_status",
    transcriptSource: "transcript_source",
    summaryStatus: "summary_status",
    worthItScore: "worth_it_score",
    updatedAt: "updated_at",
  },
  podcasts: {
    id: "id",
    title: "title",
    imageUrl: "image_url",
  },
}));

vi.mock("drizzle-orm", () => ({
  count: vi.fn(() => "COUNT(*)"),
  eq: vi.fn((col, val) => ({ eq: [col, val] })),
  sql: Object.assign(
    (strings: TemplateStringsArray) => ({
      as: (alias: string) => ({ sql: strings.join(""), alias }),
      toString: () => strings.join(""),
    }),
    { raw: (s: string) => s },
  ),
  and: vi.fn((...args) => ({ and: args })),
  gte: vi.fn((col, val) => ({ gte: [col, val] })),
  lte: vi.fn((col, val) => ({ lte: [col, val] })),
  inArray: vi.fn((col, vals) => ({ inArray: [col, vals] })),
}));

vi.mock("@/lib/admin/episode-filters", () => ({
  buildEpisodeWhereConditions: vi.fn(() => undefined),
  PAGE_SIZE: 25,
}));

function makeQueryChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "innerJoin", "where", "orderBy", "limit", "offset"];
  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  chain["then"] = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

import { getFilteredEpisodes } from "@/lib/admin/episode-queries";

describe("getFilteredEpisodes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns rows with correct worthItScore coercion", async () => {
    const rowsData = [
      {
        id: 1,
        title: "Ep 1",
        podcastId: 10,
        podcastTitle: "Pod",
        podcastImageUrl: null,
        podcastIndexId: "100",
        publishDate: new Date("2026-01-01"),
        transcriptStatus: "available",
        transcriptSource: "assemblyai",
        summaryStatus: "completed",
        worthItScore: "8.50",
      },
    ];
    const countData = [{ value: 1 }];

    let callIdx = 0;
    mockSelect.mockImplementation(() => {
      callIdx++;
      return callIdx === 1
        ? makeQueryChain(rowsData)
        : makeQueryChain(countData);
    });

    const result = await getFilteredEpisodes({ page: 1 });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].worthItScore).toBe("8.50");
    expect(result.totalCount).toBe(1);
  });

  it("returns null worthItScore when score is null", async () => {
    const rowsData = [
      {
        id: 1,
        title: "Ep 1",
        podcastId: 10,
        podcastTitle: "Pod",
        podcastImageUrl: null,
        podcastIndexId: "100",
        publishDate: null,
        transcriptStatus: "missing",
        transcriptSource: null,
        summaryStatus: null,
        worthItScore: null,
      },
    ];
    const countData = [{ value: 1 }];

    let callIdx = 0;
    mockSelect.mockImplementation(() => {
      callIdx++;
      return callIdx === 1
        ? makeQueryChain(rowsData)
        : makeQueryChain(countData);
    });

    const result = await getFilteredEpisodes({ page: 1 });
    expect(result.rows[0].worthItScore).toBeNull();
  });

  it("calculates correct offset for page > 1", async () => {
    let callIdx = 0;
    mockSelect.mockImplementation(() => {
      callIdx++;
      const chain = makeQueryChain(callIdx === 1 ? [] : [{ value: 0 }]);
      return chain;
    });

    await getFilteredEpisodes({ page: 3 });

    // The rows query chain should have .offset(50) called (page 3, PAGE_SIZE 25)
    const rowsChain = mockSelect.mock.results[0].value;
    expect(rowsChain.offset).toHaveBeenCalledWith(50);
  });

  it("returns totalCount 0 when count query returns empty", async () => {
    let callIdx = 0;
    mockSelect.mockImplementation(() => {
      callIdx++;
      return makeQueryChain(callIdx === 1 ? [] : []);
    });

    const result = await getFilteredEpisodes({ page: 1 });
    expect(result.rows).toHaveLength(0);
    expect(result.totalCount).toBe(0);
  });
});
