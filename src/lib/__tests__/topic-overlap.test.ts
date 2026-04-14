import { describe, it, expect } from "vitest";
import { buildUserTopicProfile, computeTopicOverlap } from "@/lib/topic-overlap";

describe("buildUserTopicProfile", () => {
  it("returns an empty map for no rows", () => {
    const profile = buildUserTopicProfile([]);
    expect(profile.size).toBe(0);
  });

  it("aggregates topic counts from rows", () => {
    const rows = [
      { topic: "AI Ethics", count: 3 },
      { topic: "Leadership", count: 1 },
    ];
    const profile = buildUserTopicProfile(rows);
    expect(profile.get("AI Ethics")).toBe(3);
    expect(profile.get("Leadership")).toBe(1);
  });

  it("handles multiple topics correctly", () => {
    const rows = [
      { topic: "Technology", count: 5 },
      { topic: "Finance", count: 2 },
      { topic: "Health", count: 10 },
    ];
    const profile = buildUserTopicProfile(rows);
    expect(profile.size).toBe(3);
    expect(profile.get("Health")).toBe(10);
  });
});

describe("computeTopicOverlap", () => {
  describe("global gate: totalConsumed < 3 → null for all labels", () => {
    it("returns null label when totalConsumed is 0", () => {
      const profile = new Map([["AI Ethics", 5]]);
      const episodeTopics = [{ topic: "AI Ethics", relevance: "0.90" }];
      const result = computeTopicOverlap(profile, episodeTopics, 0);
      expect(result.label).toBeNull();
      expect(result.isNewTopic).toBe(false);
      expect(result.overlapCount).toBe(0);
    });

    it("returns null label when totalConsumed is 1", () => {
      const profile = new Map([["AI Ethics", 1]]);
      const episodeTopics = [{ topic: "AI Ethics", relevance: "0.90" }];
      const result = computeTopicOverlap(profile, episodeTopics, 1);
      expect(result.label).toBeNull();
    });

    it("returns null label when totalConsumed is 2", () => {
      const profile = new Map([["AI Ethics", 2]]);
      const episodeTopics = [{ topic: "AI Ethics", relevance: "0.90" }];
      const result = computeTopicOverlap(profile, episodeTopics, 2);
      expect(result.label).toBeNull();
    });

    it("blocks 'Top pick' label when totalConsumed < 3 even with topicRank === 1", () => {
      const profile = new Map<string, number>();
      const episodeTopics = [{ topic: "Leadership", relevance: "0.95" }];
      const result = computeTopicOverlap(profile, episodeTopics, 2, 1);
      expect(result.label).toBeNull();
    });
  });

  describe("high overlap: overlapCount >= 3", () => {
    it("returns 'You've heard N similar episodes' when overlapCount >= 3", () => {
      const profile = new Map([["AI Ethics", 4]]);
      const episodeTopics = [{ topic: "AI Ethics", relevance: "0.90" }];
      const result = computeTopicOverlap(profile, episodeTopics, 5);
      expect(result.overlapCount).toBe(4);
      expect(result.topOverlapTopic).toBe("AI Ethics");
      expect(result.label).toBe("You've heard 4 similar episodes");
    });

    it("returns amber label at exactly overlapCount = 3", () => {
      const profile = new Map([["Finance", 3]]);
      const episodeTopics = [{ topic: "Finance", relevance: "0.85" }];
      const result = computeTopicOverlap(profile, episodeTopics, 4);
      expect(result.label).toBe("You've heard 3 similar episodes");
    });

    it("uses max count across multiple overlapping topics as overlapCount", () => {
      const profile = new Map([
        ["AI Ethics", 2],
        ["Technology", 5],
        ["Leadership", 1],
      ]);
      const episodeTopics = [
        { topic: "AI Ethics", relevance: "0.90" },
        { topic: "Technology", relevance: "0.80" },
        { topic: "Leadership", relevance: "0.70" },
      ];
      const result = computeTopicOverlap(profile, episodeTopics, 10);
      // overlapCount is the MAX count on the single most-overlapping topic
      expect(result.overlapCount).toBe(5);
      expect(result.topOverlapTopic).toBe("Technology");
      expect(result.label).toBe("You've heard 5 similar episodes");
    });
  });

  describe("top pick: topicRank === 1 and no overlap", () => {
    it("returns 'Top pick for [topic]' when topicRank === 1 and overlapCount === 0 and totalConsumed >= 3", () => {
      const profile = new Map([["Finance", 2]]); // user has Finance but this ep has Leadership
      const episodeTopics = [{ topic: "Leadership", relevance: "0.95" }];
      const result = computeTopicOverlap(profile, episodeTopics, 4, 1);
      expect(result.overlapCount).toBe(0);
      expect(result.label).toBe("Top pick for Leadership");
    });

    it("does NOT return 'Top pick' when topicRank === 1 but overlapCount >= 3", () => {
      const profile = new Map([["Leadership", 4]]);
      const episodeTopics = [{ topic: "Leadership", relevance: "0.95" }];
      const result = computeTopicOverlap(profile, episodeTopics, 6, 1);
      // overlap label takes priority
      expect(result.label).toBe("You've heard 4 similar episodes");
    });

    it("does NOT return 'Top pick' when topicRank is not 1 (falls through to 'New topic' rule)", () => {
      const profile = new Map<string, number>();
      const episodeTopics = [{ topic: "Leadership", relevance: "0.95" }];
      const result = computeTopicOverlap(profile, episodeTopics, 5, 2);
      // topicRank=2 → no top pick. overlapCount=0, totalConsumed=5 → "New topic for you"
      expect(result.label).toBe("New topic for you");
    });
  });

  describe("new topic: overlapCount === 0 and totalConsumed >= 5", () => {
    it("returns 'New topic for you' when no overlap and totalConsumed >= 5", () => {
      const profile = new Map([["Finance", 2]]); // different topic than episode
      const episodeTopics = [{ topic: "Leadership", relevance: "0.90" }];
      const result = computeTopicOverlap(profile, episodeTopics, 6);
      expect(result.isNewTopic).toBe(true);
      expect(result.label).toBe("New topic for you");
    });

    it("returns 'New topic for you' at exactly totalConsumed = 5", () => {
      const profile = new Map<string, number>(); // empty profile
      const episodeTopics = [{ topic: "Leadership", relevance: "0.90" }];
      const result = computeTopicOverlap(profile, episodeTopics, 5);
      expect(result.label).toBe("New topic for you");
    });

    it("does NOT return 'New topic' when totalConsumed < 5 but >= 3", () => {
      const profile = new Map<string, number>();
      const episodeTopics = [{ topic: "Leadership", relevance: "0.90" }];
      const result = computeTopicOverlap(profile, episodeTopics, 4);
      expect(result.label).toBeNull();
    });
  });

  describe("episode with no topics", () => {
    it("returns null label and zero overlapCount for episode with no topics", () => {
      const profile = new Map([["AI Ethics", 5]]);
      const result = computeTopicOverlap(profile, [], 10);
      expect(result.overlapCount).toBe(0);
      expect(result.topOverlapTopic).toBeNull();
      expect(result.isNewTopic).toBe(false);
      expect(result.label).toBeNull();
    });

    it("returns null label for no topics even when totalConsumed >= 5", () => {
      const profile = new Map<string, number>();
      const result = computeTopicOverlap(profile, [], 10);
      expect(result.label).toBeNull();
    });
  });

  describe("empty user profile", () => {
    it("returns 'New topic for you' for empty profile when totalConsumed >= 5", () => {
      const profile = new Map<string, number>();
      const episodeTopics = [{ topic: "Technology", relevance: "0.80" }];
      const result = computeTopicOverlap(profile, episodeTopics, 5);
      expect(result.overlapCount).toBe(0);
      expect(result.isNewTopic).toBe(true);
      expect(result.label).toBe("New topic for you");
    });

    it("returns null for empty profile when totalConsumed = 3 (below new-topic threshold)", () => {
      const profile = new Map<string, number>();
      const episodeTopics = [{ topic: "Technology", relevance: "0.80" }];
      const result = computeTopicOverlap(profile, episodeTopics, 3);
      expect(result.label).toBeNull();
    });
  });

  describe("mixed overlap (some topics overlap, some don't)", () => {
    it("computes overlapCount as max count on single most-overlapping topic, not count of distinct overlapping topics", () => {
      const profile = new Map([
        ["AI Ethics", 1],
        ["Technology", 2],
      ]);
      const episodeTopics = [
        { topic: "AI Ethics", relevance: "0.90" },
        { topic: "Technology", relevance: "0.80" },
        { topic: "Leadership", relevance: "0.60" }, // not in profile
      ];
      const result = computeTopicOverlap(profile, episodeTopics, 5);
      // max count = 2 (Technology), NOT 3 (count of topics matched)
      expect(result.overlapCount).toBe(2);
      expect(result.topOverlapTopic).toBe("Technology");
      // overlapCount < 3 → label depends on other rules
      // totalConsumed >= 5 but overlapCount > 0 → not new topic, not overlap → null
      expect(result.label).toBeNull();
    });
  });

  describe("otherwise → null", () => {
    it("returns null label when totalConsumed >= 3, overlapCount between 1-2, not new topic", () => {
      const profile = new Map([["AI Ethics", 2]]);
      const episodeTopics = [{ topic: "AI Ethics", relevance: "0.90" }];
      const result = computeTopicOverlap(profile, episodeTopics, 5);
      expect(result.overlapCount).toBe(2);
      expect(result.label).toBeNull();
    });
  });

  describe("top pick: topicRank not provided", () => {
    it("does not show top pick when topicRank is null", () => {
      const profile = new Map<string, number>();
      const episodeTopics = [{ topic: "Leadership", relevance: "0.95" }];
      const result = computeTopicOverlap(profile, episodeTopics, 5, null);
      // no topicRank → no top pick, but new topic applies
      expect(result.label).toBe("New topic for you");
    });

    it("does not show top pick when topicRank is undefined", () => {
      const profile = new Map<string, number>();
      const episodeTopics = [{ topic: "Leadership", relevance: "0.95" }];
      const result = computeTopicOverlap(profile, episodeTopics, 5);
      expect(result.label).toBe("New topic for you");
    });
  });
});
