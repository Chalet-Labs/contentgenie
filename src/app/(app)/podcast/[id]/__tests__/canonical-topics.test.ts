import { describe, it, expect, vi, beforeEach } from "vitest";
import { asPodcastIndexEpisodeId } from "@/types/ids";

// Inner chain: select → from → innerJoin → where → as.
const mockInnerAs = vi.fn(() => ({}));
const mockInnerWhere = vi.fn(() => ({ as: mockInnerAs }));
const mockInnerJoin = vi.fn(() => ({ where: mockInnerWhere }));
const mockInnerFrom = vi.fn(() => ({ innerJoin: mockInnerJoin }));

// Outer chain: select → from → where → orderBy.
const mockOuterOrderBy = vi.fn();
const mockOuterWhere = vi.fn(() => ({ orderBy: mockOuterOrderBy }));
const mockOuterFrom = vi.fn(() => ({ where: mockOuterWhere }));

const mockSelect = vi.fn();

vi.mock("@/db", () => ({
  db: { select: () => mockSelect() },
}));

vi.mock("@/db/schema", () => ({
  episodeCanonicalTopics: {
    episodeId: "ect.episodeId",
    canonicalTopicId: "ect.canonicalTopicId",
    coverageScore: "ect.coverageScore",
  },
  canonicalTopics: {
    id: "ct.id",
    label: "ct.label",
    kind: "ct.kind",
    status: "ct.status",
  },
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    inArray: vi.fn((col: unknown, vals: unknown) => ({ col, vals })),
    lte: vi.fn((col: unknown, val: unknown) => ({ col, val })),
    eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
    and: vi.fn((...preds: unknown[]) => ({ and: preds })),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      sql: strings.join("?"),
      values,
      as: (alias: string) => ({ sql: strings.join("?"), values, alias }),
    }),
  };
});

import { getCanonicalTopicsByPodcastIndexId } from "@/app/(app)/podcast/[id]/canonical-topics";
import { CANONICAL_TOPICS_PER_EPISODE } from "@/lib/episodes/topic-display";

describe("getCanonicalTopicsByPodcastIndexId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect
      .mockReturnValueOnce({ from: mockInnerFrom })
      .mockReturnValueOnce({ from: mockOuterFrom });
  });

  it("short-circuits on empty input without hitting the DB", async () => {
    const result = await getCanonicalTopicsByPodcastIndexId([]);
    expect(result).toEqual({});
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns {} when no rows match", async () => {
    mockOuterOrderBy.mockResolvedValue([]);
    const result = await getCanonicalTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: asPodcastIndexEpisodeId("PI-1") },
    ]);
    expect(result).toEqual({});
  });

  it("groups rows under PodcastIndex id and projects to chips", async () => {
    mockOuterOrderBy.mockResolvedValue([
      {
        episodeId: 1,
        topicId: 100,
        label: "Creatine",
        kind: "concept",
        status: "active",
      },
      {
        episodeId: 1,
        topicId: 101,
        label: "Hydration",
        kind: "concept",
        status: "active",
      },
      {
        episodeId: 2,
        topicId: 200,
        label: "Cold plunge",
        kind: "concept",
        status: "active",
      },
    ]);
    const result = await getCanonicalTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: asPodcastIndexEpisodeId("PI-1") },
      { id: 2, podcastIndexId: asPodcastIndexEpisodeId("PI-2") },
    ]);
    expect(result).toEqual({
      "PI-1": [
        { id: 100, label: "Creatine", kind: "concept", status: "active" },
        { id: 101, label: "Hydration", kind: "concept", status: "active" },
      ],
      "PI-2": [
        { id: 200, label: "Cold plunge", kind: "concept", status: "active" },
      ],
    });
  });

  it("drops rows for episodes missing from the PodcastIndex map", async () => {
    mockOuterOrderBy.mockResolvedValue([
      {
        episodeId: 999,
        topicId: 1,
        label: "Orphaned",
        kind: "concept",
        status: "active",
      },
    ]);
    const result = await getCanonicalTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: asPodcastIndexEpisodeId("PI-1") },
    ]);
    expect(result).toEqual({});
  });

  it("returns {} and logs when the DB query throws", async () => {
    mockOuterOrderBy.mockRejectedValue(new Error("boom"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await getCanonicalTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: asPodcastIndexEpisodeId("PI-1") },
    ]);
    expect(result).toEqual({});
    expect(consoleSpy).toHaveBeenCalledWith(
      "[podcast] getCanonicalTopicsByPodcastIndexId failed",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it("applies a top-N rank limit on the outer query", async () => {
    mockOuterOrderBy.mockResolvedValue([]);
    await getCanonicalTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: asPodcastIndexEpisodeId("PI-1") },
    ]);
    expect(mockOuterWhere).toHaveBeenCalledWith(
      expect.objectContaining({ val: CANONICAL_TOPICS_PER_EPISODE }),
    );
  });
});
