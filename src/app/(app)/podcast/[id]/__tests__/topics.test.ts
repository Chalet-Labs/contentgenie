import { describe, it, expect, vi, beforeEach } from "vitest";

const mockWhere = vi.fn();
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
    mockWhere.mockResolvedValue([]);
    const result = await getTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: "PI-1" },
    ]);
    expect(result).toEqual({});
  });

  it("groups topics by episode, sorts by rank ascending, caps at TOPICS_PER_EPISODE_LIMIT", async () => {
    mockWhere.mockResolvedValue([
      { episodeId: 1, topic: "C", topicRank: 3 },
      { episodeId: 1, topic: "A", topicRank: 1 },
      { episodeId: 1, topic: "B", topicRank: 2 },
      { episodeId: 1, topic: "D", topicRank: 4 },
      { episodeId: 1, topic: "E", topicRank: 5 },
    ]);
    const result = await getTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: "PI-1" },
    ]);
    expect(result["PI-1"]).toHaveLength(TOPICS_PER_EPISODE_LIMIT);
    expect(result["PI-1"]).toEqual(["A", "B", "C", "D"]);
  });

  it("drops NULL ranks to the end of each episode's list", async () => {
    mockWhere.mockResolvedValue([
      { episodeId: 1, topic: "ranked", topicRank: 1 },
      { episodeId: 1, topic: "null-a", topicRank: null },
      { episodeId: 1, topic: "null-b", topicRank: null },
    ]);
    const result = await getTopicsByPodcastIndexId([
      { id: 1, podcastIndexId: "PI-1" },
    ]);
    expect(result["PI-1"][0]).toBe("ranked");
    expect(result["PI-1"].slice(1).sort()).toEqual(["null-a", "null-b"]);
  });

  it("remaps DB ids to PodcastIndex ids in the output keys", async () => {
    mockWhere.mockResolvedValue([
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
    mockWhere.mockRejectedValue(new Error("neon unreachable"));
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
