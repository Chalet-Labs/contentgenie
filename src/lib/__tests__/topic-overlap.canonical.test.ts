import { describe, it, expect } from "vitest";
import {
  computeCanonicalTopicOverlap,
  type CanonicalOverlapTargetRow,
} from "@/lib/topic-overlap";

describe("computeCanonicalTopicOverlap", () => {
  describe("empty target canonicals → null", () => {
    it("returns null when targetCanonicals is empty", () => {
      const result = computeCanonicalTopicOverlap([], new Map([[1, 3]]));
      expect(result).toBeNull();
    });

    it("returns null when targetCanonicals is empty and counts map is also empty", () => {
      const result = computeCanonicalTopicOverlap([], new Map());
      expect(result).toBeNull();
    });
  });

  describe("all zero counts → 'new' with highest-coverage canonical", () => {
    it("returns kind:'new' when userOverlapCounts is empty (no consumed episodes)", () => {
      const targets: CanonicalOverlapTargetRow[] = [
        { canonicalTopicId: 10, topicLabel: "Opus 4.7", coverageScore: 0.9 },
      ];
      const result = computeCanonicalTopicOverlap(targets, new Map());
      expect(result).toEqual({
        kind: "new",
        topicLabel: "Opus 4.7",
        topicId: 10,
      });
    });

    it("returns kind:'new' selecting the highest-coverage canonical when all counts are zero", () => {
      const targets: CanonicalOverlapTargetRow[] = [
        { canonicalTopicId: 1, topicLabel: "AI Safety", coverageScore: 0.5 },
        {
          canonicalTopicId: 2,
          topicLabel: "Model Releases",
          coverageScore: 0.8,
        },
        { canonicalTopicId: 3, topicLabel: "Leadership", coverageScore: 0.3 },
      ];
      const result = computeCanonicalTopicOverlap(targets, new Map());
      expect(result).toEqual({
        kind: "new",
        topicLabel: "Model Releases",
        topicId: 2,
      });
    });
  });

  describe("one positive count → 'repeat'", () => {
    it("returns kind:'repeat' with the matching canonical when one has a positive count", () => {
      const targets: CanonicalOverlapTargetRow[] = [
        { canonicalTopicId: 5, topicLabel: "Opus 4.7", coverageScore: 0.9 },
      ];
      const result = computeCanonicalTopicOverlap(targets, new Map([[5, 2]]));
      expect(result).toEqual({
        kind: "repeat",
        count: 2,
        topicLabel: "Opus 4.7",
        topicId: 5,
      });
    });

    it("returns kind:'repeat' and ignores zero-count canonicals", () => {
      const targets: CanonicalOverlapTargetRow[] = [
        {
          canonicalTopicId: 1,
          topicLabel: "AI Safety",
          coverageScore: 0.9,
        },
        {
          canonicalTopicId: 2,
          topicLabel: "Model Releases",
          coverageScore: 0.7,
        },
      ];
      // Only canonical 2 has a positive count
      const result = computeCanonicalTopicOverlap(
        targets,
        new Map([
          [1, 0],
          [2, 3],
        ]),
      );
      expect(result).toEqual({
        kind: "repeat",
        count: 3,
        topicLabel: "Model Releases",
        topicId: 2,
      });
    });
  });

  describe("multiple positives → max-count canonical wins", () => {
    it("selects the canonical with the highest count", () => {
      const targets: CanonicalOverlapTargetRow[] = [
        { canonicalTopicId: 1, topicLabel: "AI Safety", coverageScore: 0.8 },
        {
          canonicalTopicId: 2,
          topicLabel: "Model Releases",
          coverageScore: 0.9,
        },
        { canonicalTopicId: 3, topicLabel: "Leadership", coverageScore: 0.7 },
      ];
      const result = computeCanonicalTopicOverlap(
        targets,
        new Map([
          [1, 3],
          [2, 1],
          [3, 5],
        ]),
      );
      expect(result).toEqual({
        kind: "repeat",
        count: 5,
        topicLabel: "Leadership",
        topicId: 3,
      });
    });
  });

  describe("tie on max count → highest coverage_score wins", () => {
    it("selects the canonical with highest coverageScore when counts are tied", () => {
      const targets: CanonicalOverlapTargetRow[] = [
        { canonicalTopicId: 1, topicLabel: "AI Safety", coverageScore: 0.6 },
        {
          canonicalTopicId: 2,
          topicLabel: "Model Releases",
          coverageScore: 0.9,
        },
        { canonicalTopicId: 3, topicLabel: "Leadership", coverageScore: 0.7 },
      ];
      const result = computeCanonicalTopicOverlap(
        targets,
        new Map([
          [1, 4],
          [2, 4],
          [3, 2],
        ]),
      );
      expect(result).toEqual({
        kind: "repeat",
        count: 4,
        topicLabel: "Model Releases",
        topicId: 2,
      });
    });
  });

  describe("tie on coverage_score (within tied counts) → lowest canonicalTopicId wins", () => {
    it("selects the lowest canonicalTopicId when count and coverageScore are both tied", () => {
      const targets: CanonicalOverlapTargetRow[] = [
        { canonicalTopicId: 10, topicLabel: "Topic A", coverageScore: 0.8 },
        { canonicalTopicId: 5, topicLabel: "Topic B", coverageScore: 0.8 },
        { canonicalTopicId: 7, topicLabel: "Topic C", coverageScore: 0.8 },
      ];
      const result = computeCanonicalTopicOverlap(
        targets,
        new Map([
          [10, 3],
          [5, 3],
          [7, 3],
        ]),
      );
      expect(result).toEqual({
        kind: "repeat",
        count: 3,
        topicLabel: "Topic B",
        topicId: 5,
      });
    });

    it("selects lowest canonicalTopicId for 'new' when coverageScores are tied", () => {
      const targets: CanonicalOverlapTargetRow[] = [
        { canonicalTopicId: 10, topicLabel: "Topic A", coverageScore: 0.75 },
        { canonicalTopicId: 3, topicLabel: "Topic B", coverageScore: 0.75 },
        { canonicalTopicId: 7, topicLabel: "Topic C", coverageScore: 0.75 },
      ];
      const result = computeCanonicalTopicOverlap(targets, new Map());
      expect(result).toEqual({
        kind: "new",
        topicLabel: "Topic B",
        topicId: 3,
      });
    });
  });

  describe("single canonical", () => {
    it("returns kind:'new' for a single canonical with no consumed overlap", () => {
      const targets: CanonicalOverlapTargetRow[] = [
        { canonicalTopicId: 1, topicLabel: "AI Ethics", coverageScore: 0.95 },
      ];
      const result = computeCanonicalTopicOverlap(targets, new Map([[2, 5]]));
      expect(result).toEqual({
        kind: "new",
        topicLabel: "AI Ethics",
        topicId: 1,
      });
    });
  });
});
