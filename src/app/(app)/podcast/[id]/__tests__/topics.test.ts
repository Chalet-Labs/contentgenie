import { describe, it, expect, vi, beforeEach } from "vitest";

const mockOrderBy = vi.fn();
const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

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

vi.mock("drizzle-orm", () => ({
  inArray: vi.fn((col: unknown, vals: unknown) => ({ col, vals })),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: strings.join("?"),
    values,
  }),
}));

import {
  getTopicsByPodcastIndexId,
  TOPICS_PER_EPISODE_LIMIT,
} from "@/app/(app)/podcast/[id]/topics";

describe("getTopicsByPodcastIndexId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("short-circuits on empty input without hitting the DB", async () => {
    const result = await getTopicsByPodcastIndexId([]);
    expect(result).toEqual({});
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns {} when no topic rows exist for the requested episodes", async () => {
    mockOrderBy.mockResolvedValue([]);
    const result = await getTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: "PI-1" },
    ]);
    expect(result).toEqual({});
  });

  // The DB returns rows already ordered by topicRank ASC NULLS LAST, so the
  // helper just needs to preserve insertion order and cap per-episode.
  it("preserves DB order and caps at TOPICS_PER_EPISODE_LIMIT", async () => {
    mockOrderBy.mockResolvedValue([
      { episodeId: 1, topic: "A" },
      { episodeId: 1, topic: "B" },
      { episodeId: 1, topic: "C" },
      { episodeId: 1, topic: "D" },
      { episodeId: 1, topic: "E" },
    ]);
    const result = await getTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: "PI-1" },
    ]);
    expect(result["PI-1"]).toHaveLength(TOPICS_PER_EPISODE_LIMIT);
    expect(result["PI-1"]).toEqual(["A", "B", "C", "D"]);
  });

  it("orders topics by topicRank ASC NULLS LAST in the SQL query", async () => {
    mockOrderBy.mockResolvedValue([]);
    await getTopicsByPodcastIndexId([{ id: 1, podcastIndexId: "PI-1" }]);
    const orderByArg = mockOrderBy.mock.calls[0][0];
    expect(orderByArg.sql).toContain("ASC NULLS LAST");
  });

  it("remaps DB ids to PodcastIndex ids in the output keys", async () => {
    mockOrderBy.mockResolvedValue([
      { episodeId: 10, topic: "X" },
      { episodeId: 20, topic: "Y" },
    ]);
    const result = await getTopicsByPodcastIndexId([
      { id: 10, podcastIndexId: "PI-A" },
      { id: 20, podcastIndexId: "PI-B" },
    ]);
    expect(result).toEqual({ "PI-A": ["X"], "PI-B": ["Y"] });
  });

  it("returns {} and logs on DB failure instead of throwing", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockOrderBy.mockRejectedValue(new Error("neon unreachable"));
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
