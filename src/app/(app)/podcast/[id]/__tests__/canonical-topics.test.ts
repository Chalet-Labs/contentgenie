import { describe, it, expect, vi, beforeEach } from "vitest";
import { asPodcastIndexEpisodeId } from "@/types/ids";

// Inner chain: select → from → innerJoin → where → as.
const mockInnerAs = vi.fn(() => ({}));
const mockInnerWhere = vi.fn(() => ({ as: mockInnerAs }));
const mockInnerJoin = vi.fn(() => ({ where: mockInnerWhere }));
const mockInnerFrom = vi.fn(() => ({ innerJoin: mockInnerJoin }));

// Outer chain: select → from → where → orderBy (window-rank result).
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

// Chip-metadata helper is mocked directly so tests can drive the
// post-enrichment path without re-stubbing the underlying DB chains.
const mockFetchChipMetadata = vi.fn();
vi.mock("@/lib/canonical-topic-chip-metadata", () => ({
  fetchChipMetadata: (...args: unknown[]) => mockFetchChipMetadata(...args),
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
import { STALENESS_GROWTH_THRESHOLD } from "@/lib/topic-digest-thresholds";

describe("getCanonicalTopicsByPodcastIndexId", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Re-install chain factories (resetAllMocks wipes implementations).
    mockInnerAs.mockImplementation(() => ({}));
    mockInnerWhere.mockImplementation(() => ({ as: mockInnerAs }));
    mockInnerJoin.mockImplementation(() => ({ where: mockInnerWhere }));
    mockInnerFrom.mockImplementation(() => ({ innerJoin: mockInnerJoin }));
    mockOuterWhere.mockImplementation(() => ({ orderBy: mockOuterOrderBy }));
    mockOuterFrom.mockImplementation(() => ({ where: mockOuterWhere }));
    // Two select() calls: inner subquery, outer SELECT. Chip metadata comes
    // from `fetchChipMetadata` (mocked above), not from a third select.
    mockSelect
      .mockReturnValueOnce({ from: mockInnerFrom })
      .mockReturnValueOnce({ from: mockOuterFrom });
    // Default: helper returns empty Map → chips render without CTA.
    mockFetchChipMetadata.mockResolvedValue(new Map());
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

  it("groups rows under PodcastIndex id and projects to chips (no enrichment)", async () => {
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

  // ── Post-enrichment / synthesizable state tests ────────────────────────────

  // Helper: row that the outer (window-rank) select returns for a given chip.
  const outerRow = (topicId: number) => ({
    episodeId: 1,
    topicId,
    label: "AI Ethics",
    kind: "concept",
    status: "active",
  });

  it("post-enrichment: synthesizable=true when no digest", async () => {
    mockOuterOrderBy.mockResolvedValue([outerRow(100)]);
    mockFetchChipMetadata.mockResolvedValue(
      new Map([
        [
          100,
          { completedSummaryCount: 5, digestEpisodeCountAtGeneration: null },
        ],
      ]),
    );
    const piKey = asPodcastIndexEpisodeId("PI-1");
    const result = await getCanonicalTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: piKey },
    ]);
    expect(result[piKey]![0]!.synthesizable).toBe(true);
  });

  it("post-enrichment: synthesizable=false below MIN_DERIVED_COUNT_FOR_DIGEST", async () => {
    mockOuterOrderBy.mockResolvedValue([outerRow(100)]);
    mockFetchChipMetadata.mockResolvedValue(
      new Map([
        [
          100,
          { completedSummaryCount: 2, digestEpisodeCountAtGeneration: null },
        ],
      ]),
    );
    const piKey = asPodcastIndexEpisodeId("PI-1");
    const result = await getCanonicalTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: piKey },
    ]);
    expect(result[piKey]![0]!.synthesizable).toBe(false);
  });

  it("post-enrichment: synthesizable=false when fresh (|growth| < STALENESS_GROWTH_THRESHOLD)", async () => {
    const digestEpisodeCountAtGeneration = 10;
    const completedSummaryCount =
      digestEpisodeCountAtGeneration + STALENESS_GROWTH_THRESHOLD - 1;
    mockOuterOrderBy.mockResolvedValue([outerRow(100)]);
    mockFetchChipMetadata.mockResolvedValue(
      new Map([
        [100, { completedSummaryCount, digestEpisodeCountAtGeneration }],
      ]),
    );
    const piKey = asPodcastIndexEpisodeId("PI-1");
    const result = await getCanonicalTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: piKey },
    ]);
    expect(result[piKey]![0]!.synthesizable).toBe(false);
  });

  it("post-enrichment: synthesizable=true when stale (growth >= STALENESS_GROWTH_THRESHOLD)", async () => {
    const digestEpisodeCountAtGeneration = 10;
    const completedSummaryCount =
      digestEpisodeCountAtGeneration + STALENESS_GROWTH_THRESHOLD;
    mockOuterOrderBy.mockResolvedValue([outerRow(100)]);
    mockFetchChipMetadata.mockResolvedValue(
      new Map([
        [100, { completedSummaryCount, digestEpisodeCountAtGeneration }],
      ]),
    );
    const piKey = asPodcastIndexEpisodeId("PI-1");
    const result = await getCanonicalTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: piKey },
    ]);
    expect(result[piKey]![0]!.synthesizable).toBe(true);
  });

  it("post-enrichment: synthesizable=true when canonical SHRANK by ≥ STALENESS_GROWTH_THRESHOLD (Math.abs)", async () => {
    const digestEpisodeCountAtGeneration = 10;
    const completedSummaryCount =
      digestEpisodeCountAtGeneration - STALENESS_GROWTH_THRESHOLD;
    mockOuterOrderBy.mockResolvedValue([outerRow(100)]);
    mockFetchChipMetadata.mockResolvedValue(
      new Map([
        [100, { completedSummaryCount, digestEpisodeCountAtGeneration }],
      ]),
    );
    const piKey = asPodcastIndexEpisodeId("PI-1");
    const result = await getCanonicalTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: piKey },
    ]);
    expect(result[piKey]![0]!.synthesizable).toBe(true);
  });

  it("post-enrichment failure: chips emit without synthesizable; no error thrown", async () => {
    mockOuterOrderBy.mockResolvedValue([outerRow(100)]);
    mockFetchChipMetadata.mockRejectedValue(new Error("boom"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const piKey = asPodcastIndexEpisodeId("PI-1");
    const result = await getCanonicalTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: piKey },
    ]);
    expect(result[piKey]![0]!.synthesizable).toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      "[podcast] chip metadata enrichment failed (chips render without synthesize CTA)",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});
