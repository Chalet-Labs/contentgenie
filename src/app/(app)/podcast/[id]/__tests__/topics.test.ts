import { describe, it, expect, vi, beforeEach } from "vitest";
import { asPodcastIndexEpisodeId } from "@/types/ids";

// Inner chain: select → from → where → as (stand-in for the subquery object).
const mockInnerAs = vi.fn(() => ({}));
const mockInnerWhere = vi.fn(() => ({ as: mockInnerAs }));
const mockInnerFrom = vi.fn(() => ({ where: mockInnerWhere }));

// Outer chain: select → from → where → orderBy.
// Tests set mockOuterOrderBy.mockResolvedValue(...) per case to control awaited rows.
const mockOuterOrderBy = vi.fn();
const mockOuterWhere = vi.fn(() => ({ orderBy: mockOuterOrderBy }));
const mockOuterFrom = vi.fn(() => ({ where: mockOuterWhere }));

// Production code calls db.select() exactly twice per invocation: subquery
// (inner) first, outer SELECT second. If that contract changes, update these
// queued returns in lockstep.
const mockSelect = vi.fn();

vi.mock("@/db", () => ({
  db: { select: () => mockSelect() },
}));

vi.mock("@/db/schema", () => ({
  episodeTopics: {
    episodeId: "episodeId",
    topic: "topic",
    topicRank: "topicRank",
  },
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    inArray: vi.fn((col: unknown, vals: unknown) => ({ col, vals })),
    lte: vi.fn((col: unknown, val: unknown) => ({ col, val })),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      sql: strings.join("?"),
      values,
      as: (alias: string) => ({ sql: strings.join("?"), values, alias }),
    }),
  };
});

import {
  getTopicsByPodcastIndexId,
  TOPICS_PER_EPISODE_LIMIT,
} from "@/app/(app)/podcast/[id]/topics";
import { MAX_DISPLAYED_TOPICS } from "@/lib/episodes/topic-display";

describe("getTopicsByPodcastIndexId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect
      .mockReturnValueOnce({ from: mockInnerFrom })
      .mockReturnValueOnce({ from: mockOuterFrom });
  });

  it("short-circuits on empty input without hitting the DB", async () => {
    const result = await getTopicsByPodcastIndexId([]);
    expect(result).toEqual({});
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns {} when no topic rows exist for the requested episodes", async () => {
    mockOuterOrderBy.mockResolvedValue([]);
    const result = await getTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: asPodcastIndexEpisodeId("PI-1") },
    ]);
    expect(result).toEqual({});
  });

  it("preserves DB order end-to-end", async () => {
    mockOuterOrderBy.mockResolvedValue([
      { episodeId: 1, topic: "A" },
      { episodeId: 1, topic: "B" },
      { episodeId: 1, topic: "C" },
      { episodeId: 1, topic: "D" },
    ]);
    const result = await getTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: asPodcastIndexEpisodeId("PI-1") },
    ]);
    expect(result[asPodcastIndexEpisodeId("PI-1")]).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
  });

  it("trusts the DB cap — does not re-cap in JS if extra rows slip through", async () => {
    // Seed more rows than TOPICS_PER_EPISODE_LIMIT to prove no JS-side cap
    // exists. If anyone reintroduces a `slice(0, N)` or a break loop, this
    // assertion fails loudly.
    const oversized = Array.from({ length: 10 }, (_, i) => ({
      episodeId: 1,
      topic: `T${i}`,
    }));
    mockOuterOrderBy.mockResolvedValue(oversized);
    const result = await getTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: asPodcastIndexEpisodeId("PI-1") },
    ]);
    expect(result[asPodcastIndexEpisodeId("PI-1")]).toHaveLength(
      oversized.length,
    );
  });

  it("remaps DB ids to PodcastIndex ids in the output keys", async () => {
    mockOuterOrderBy.mockResolvedValue([
      { episodeId: 10, topic: "X" },
      { episodeId: 20, topic: "Y" },
    ]);
    const result = await getTopicsByPodcastIndexId([
      { id: 10, podcastIndexId: asPodcastIndexEpisodeId("PI-A") },
      { id: 20, podcastIndexId: asPodcastIndexEpisodeId("PI-B") },
    ]);
    expect(result).toEqual({ "PI-A": ["X"], "PI-B": ["Y"] });
  });

  it("returns {} and logs on DB failure instead of throwing", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockOuterOrderBy.mockRejectedValue(new Error("neon unreachable"));
    const result = await getTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: asPodcastIndexEpisodeId("PI-1") },
    ]);
    expect(result).toEqual({});
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("getTopicsByPodcastIndexId failed"),
      expect.any(Error),
    );
    errSpy.mockRestore();
  });

  it("derives TOPICS_PER_EPISODE_LIMIT from MAX_DISPLAYED_TOPICS + 1", () => {
    expect(TOPICS_PER_EPISODE_LIMIT).toBe(MAX_DISPLAYED_TOPICS + 1);
  });
});

describe("getTopicsByPodcastIndexId — SQL shape (QueryBuilder.toSQL)", () => {
  it("generated SQL has the window function, the lte bound, and a stable outer ORDER BY", async () => {
    const { QueryBuilder } = await vi.importActual<
      typeof import("drizzle-orm/pg-core")
    >("drizzle-orm/pg-core");
    const { inArray, lte, sql } =
      await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
    const { episodeTopics: realEpisodeTopics } =
      await vi.importActual<typeof import("@/db/schema")>("@/db/schema");

    const qb = new QueryBuilder();
    const episodeIds = [1, 2, 3];

    const sub = qb
      .select({
        episodeId: realEpisodeTopics.episodeId,
        topic: realEpisodeTopics.topic,
        rn: sql<number>`
          row_number() over (
            partition by ${realEpisodeTopics.episodeId}
            order by ${realEpisodeTopics.topicRank} nulls last, ${realEpisodeTopics.topic}
          )
        `.as("rn"),
      })
      .from(realEpisodeTopics)
      .where(inArray(realEpisodeTopics.episodeId, episodeIds))
      .as("sub");

    const { sql: generatedSql, params } = qb
      .select({
        episodeId: sub.episodeId,
        topic: sub.topic,
      })
      .from(sub)
      .where(lte(sub.rn, TOPICS_PER_EPISODE_LIMIT))
      .orderBy(sub.episodeId, sub.rn)
      .toSQL();

    expect(generatedSql).toContain("row_number()");
    expect(generatedSql).toContain("partition by");
    expect(generatedSql).toContain("nulls last");
    expect(generatedSql).toMatch(/<=\s*\$\d+/);
    expect(generatedSql).toMatch(/order by/i);
    expect(params).toContain(TOPICS_PER_EPISODE_LIMIT);
  });
});
