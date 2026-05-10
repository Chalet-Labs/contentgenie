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

// Secondary chain (post-enrichment): TWO parallel single-table queries:
//   - select → from(canonicalTopics) → where(inArray)  (episode-count rows)
//   - select → from(canonicalTopicDigests) → where(inArray)  (digest rows)
// Each `.where(inArray(...))` is awaited directly. We track them as a queue
// drained in order; tests push results via `mockSecondaryQueryResults.push(...)`.
const mockSecondaryQueryResults: unknown[] = [];
const mockSecondaryWhere = vi.fn(() =>
  mockSecondaryQueryResults.length > 0
    ? Promise.resolve(mockSecondaryQueryResults.shift())
    : Promise.resolve([]),
);
const mockSecondaryFrom = vi.fn(() => ({ where: mockSecondaryWhere }));

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
  canonicalTopicDigests: {
    canonicalTopicId: "ctd.canonicalTopicId",
    episodeCountAtGeneration: "ctd.episodeCountAtGeneration",
  },
}));

vi.mock("@/lib/admin/canonical-topic-episode-count", () => ({
  canonicalTopicEpisodeCount: vi.fn(() => ({
    type: "sql",
    template: ["(SELECT count(*)...)"],
    values: [],
  })),
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
    mockSecondaryWhere.mockImplementation(() =>
      mockSecondaryQueryResults.length > 0
        ? Promise.resolve(mockSecondaryQueryResults.shift())
        : Promise.resolve([]),
    );
    mockSecondaryFrom.mockImplementation(() => ({
      where: mockSecondaryWhere,
    }));
    // Up to four select() calls: inner subquery, outer SELECT, then
    // pass-A (canonical_topics counts), pass-B (canonical_topic_digests
    // staleness). Pass A+B run in parallel (Promise.all) and only fire
    // when outer returned >0 rows.
    mockSelect
      .mockReturnValueOnce({ from: mockInnerFrom })
      .mockReturnValueOnce({ from: mockOuterFrom })
      .mockReturnValueOnce({ from: mockSecondaryFrom })
      .mockReturnValueOnce({ from: mockSecondaryFrom });
    // Default: secondary enrichment queue is empty → pass-A/B return [].
    mockSecondaryQueryResults.length = 0;
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
    // No secondary enrichment: chips emit base shape (no episodeCount/synthesizable).
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

  it("post-enrichment: episodeCount + synthesizable set on chips when secondary query returns metadata", async () => {
    mockOuterOrderBy.mockResolvedValue([outerRow(100)]);
    // Pass A: count rows; pass B: digest rows (empty → no digest).
    mockSecondaryQueryResults.push([{ id: 100, episodeCount: 5 }], []);
    const piKey = asPodcastIndexEpisodeId("PI-1");
    const result = await getCanonicalTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: piKey },
    ]);
    expect(result[piKey]![0]!.episodeCount).toBe(5);
    expect(result[piKey]![0]!.synthesizable).toBe(true);
  });

  it("post-enrichment: no digest (pass-B returns empty) → synthesizable=true", async () => {
    mockOuterOrderBy.mockResolvedValue([outerRow(100)]);
    mockSecondaryQueryResults.push([{ id: 100, episodeCount: 5 }], []);
    const piKey = asPodcastIndexEpisodeId("PI-1");
    const result = await getCanonicalTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: piKey },
    ]);
    expect(result[piKey]![0]!.synthesizable).toBe(true);
  });

  it("post-enrichment: fresh digest (growth < STALENESS_GROWTH_THRESHOLD) → synthesizable=false", async () => {
    const episodeCountAtGeneration = 10;
    const episodeCount =
      episodeCountAtGeneration + STALENESS_GROWTH_THRESHOLD - 1;
    mockOuterOrderBy.mockResolvedValue([outerRow(100)]);
    mockSecondaryQueryResults.push(
      [{ id: 100, episodeCount }],
      [{ id: 100, episodeCountAtGeneration }],
    );
    const piKey = asPodcastIndexEpisodeId("PI-1");
    const result = await getCanonicalTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: piKey },
    ]);
    expect(result[piKey]![0]!.synthesizable).toBe(false);
  });

  it("post-enrichment: stale digest (growth >= STALENESS_GROWTH_THRESHOLD) → synthesizable=true", async () => {
    const episodeCountAtGeneration = 10;
    const episodeCount = episodeCountAtGeneration + STALENESS_GROWTH_THRESHOLD;
    mockOuterOrderBy.mockResolvedValue([outerRow(100)]);
    mockSecondaryQueryResults.push(
      [{ id: 100, episodeCount }],
      [{ id: 100, episodeCountAtGeneration }],
    );
    const piKey = asPodcastIndexEpisodeId("PI-1");
    const result = await getCanonicalTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: piKey },
    ]);
    expect(result[piKey]![0]!.synthesizable).toBe(true);
  });

  it("post-enrichment failure: chips emit without episodeCount/synthesizable; no error thrown", async () => {
    mockOuterOrderBy.mockResolvedValue([outerRow(100)]);
    // Push a rejecting thenable so Promise.all rejects → outer try/catch.
    mockSecondaryQueryResults.push(Promise.reject(new Error("boom")));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const piKey = asPodcastIndexEpisodeId("PI-1");
    const result = await getCanonicalTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: piKey },
    ]);
    expect(result[piKey]![0]!.episodeCount).toBeUndefined();
    expect(result[piKey]![0]!.synthesizable).toBeUndefined();
    // Action returns chips successfully (degraded UX, not broken page).
    expect(consoleSpy).toHaveBeenCalledWith(
      "[podcast] chip metadata enrichment failed (chips render without synthesize CTA)",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});
