import { describe, it, expect, vi, beforeEach } from "vitest";

// Inner chain: select → from → where → as (returns subquery sentinel)
const mockInnerAs = vi.fn(() => ({ __subquery: true }));
const mockInnerWhere = vi.fn(() => ({ as: mockInnerAs }));
const mockInnerFrom = vi.fn(() => ({ where: mockInnerWhere }));

// Outer chain: select → from → where (awaitable terminal)
const mockOuterWhere = vi.fn();
const mockOuterFrom = vi.fn(() => ({ where: mockOuterWhere }));

// mockSelect alternates: first call → inner chain, second call → outer chain
let selectCallCount = 0;
const mockSelect = vi.fn(() => {
  selectCallCount += 1;
  if (selectCallCount % 2 === 1) {
    return { from: mockInnerFrom };
  }
  return { from: mockOuterFrom };
});

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

describe("getTopicsByPodcastIndexId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCallCount = 0;
  });

  it("short-circuits on empty input without hitting the DB", async () => {
    const result = await getTopicsByPodcastIndexId([]);
    expect(result).toEqual({});
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns {} when no topic rows exist for the requested episodes", async () => {
    mockOuterWhere.mockResolvedValue([]);
    const result = await getTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: "PI-1" },
    ]);
    expect(result).toEqual({});
  });

  it("preserves DB order and caps at TOPICS_PER_EPISODE_LIMIT", async () => {
    mockOuterWhere.mockResolvedValue([
      { episodeId: 1, topic: "A", topicRank: 1 },
      { episodeId: 1, topic: "B", topicRank: 2 },
      { episodeId: 1, topic: "C", topicRank: 3 },
      { episodeId: 1, topic: "D", topicRank: 4 },
    ]);
    const result = await getTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: "PI-1" },
    ]);
    expect(result["PI-1"]).toHaveLength(TOPICS_PER_EPISODE_LIMIT);
    expect(result["PI-1"]).toEqual(["A", "B", "C", "D"]);
  });

  it("remaps DB ids to PodcastIndex ids in the output keys", async () => {
    mockOuterWhere.mockResolvedValue([
      { episodeId: 10, topic: "X", topicRank: 1 },
      { episodeId: 20, topic: "Y", topicRank: 1 },
    ]);
    const result = await getTopicsByPodcastIndexId([
      { id: 10, podcastIndexId: "PI-A" },
      { id: 20, podcastIndexId: "PI-B" },
    ]);
    expect(result).toEqual({ "PI-A": ["X"], "PI-B": ["Y"] });
  });

  it("returns {} and logs on DB failure instead of throwing", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockOuterWhere.mockRejectedValue(new Error("neon unreachable"));
    const result = await getTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: "PI-1" },
    ]);
    expect(result).toEqual({});
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("getTopicsByPodcastIndexId failed"),
      expect.any(Error),
    );
    errSpy.mockRestore();
  });
});

describe("getTopicsByPodcastIndexId — SQL shape (QueryBuilder.toSQL)", () => {
  it("generated SQL contains row_number() window function and lte bound for TOPICS_PER_EPISODE_LIMIT", async () => {
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
        topicRank: realEpisodeTopics.topicRank,
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
        topicRank: sub.topicRank,
      })
      .from(sub)
      .where(lte(sub.rn, TOPICS_PER_EPISODE_LIMIT))
      .toSQL();

    expect(generatedSql).toContain("row_number()");
    expect(generatedSql).toContain("nulls last");
    expect(generatedSql).toMatch(/<=\s*\$\d+/);
    expect(params).toContain(TOPICS_PER_EPISODE_LIMIT);
  });
});
