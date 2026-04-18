import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  STALE_THRESHOLD_MS,
  dedupeTopics,
  getTopicSlug,
  isTrendingSnapshotStale,
} from "@/lib/trending";
import type { TrendingTopic } from "@/db/schema";

const MOCK_NOW = new Date("2026-03-15T12:00:00.000Z");

function makeTopic(overrides: Partial<TrendingTopic> = {}): TrendingTopic {
  const name = overrides.name ?? "Test Topic";
  return {
    name,
    description: "",
    episodeCount: 0,
    episodeIds: [],
    slug: name.toLowerCase(),
    ...overrides,
  };
}

describe("isTrendingSnapshotStale", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false for null or undefined generatedAt", () => {
    expect(isTrendingSnapshotStale(null)).toBe(false);
    expect(isTrendingSnapshotStale(undefined)).toBe(false);
  });

  it("returns false just inside the 48h threshold", () => {
    const oneSecondInside = new Date(MOCK_NOW.getTime() - STALE_THRESHOLD_MS + 1_000);
    expect(isTrendingSnapshotStale(oneSecondInside)).toBe(false);
  });

  it("returns false exactly at the threshold boundary", () => {
    const exactlyAtThreshold = new Date(MOCK_NOW.getTime() - STALE_THRESHOLD_MS);
    expect(isTrendingSnapshotStale(exactlyAtThreshold)).toBe(false);
  });

  it("returns true just past the 48h threshold", () => {
    const oneSecondPast = new Date(MOCK_NOW.getTime() - STALE_THRESHOLD_MS - 1_000);
    expect(isTrendingSnapshotStale(oneSecondPast)).toBe(true);
  });

  it("returns false for a snapshot from the future (defensive)", () => {
    const future = new Date(MOCK_NOW.getTime() + 60 * 1000);
    expect(isTrendingSnapshotStale(future)).toBe(false);
  });
});

describe("getTopicSlug", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("returns the populated slug as-is", () => {
    const topic = makeTopic({ name: "Climate Tech", slug: "climate-tech" });
    expect(getTopicSlug(topic)).toBe("climate-tech");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("falls back to slugify(name) for an empty-string slug and warns", () => {
    const topic = makeTopic({ name: "Climate Tech", slug: "" });
    expect(getTopicSlug(topic)).toBe("climate-tech");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to slugify(name) for a missing slug (pre-#279 rows) without warning", () => {
    // Pre-#279 JSON rows lack a slug key at runtime even though TS claims it is required.
    const topic = { name: "Climate Tech" } as unknown as TrendingTopic;
    expect(getTopicSlug(topic)).toBe("climate-tech");
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("dedupeTopics", () => {
  it("returns { topic, slug } pairs for each unique slug", () => {
    const topics = [
      makeTopic({ name: "AI", slug: "ai" }),
      makeTopic({ name: "Climate", slug: "climate" }),
    ];
    const result = dedupeTopics(topics);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ topic: topics[0], slug: "ai" });
    expect(result[1]).toEqual({ topic: topics[1], slug: "climate" });
  });

  it("collapses duplicate slugs to one entry", () => {
    const topics = [
      makeTopic({ name: "AI", slug: "ai" }),
      makeTopic({ name: "AI", slug: "ai" }),
      makeTopic({ name: "Tech", slug: "tech" }),
    ];
    const result = dedupeTopics(topics);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.slug)).toEqual(["ai", "tech"]);
  });

  it("preserves two topics with the same display name but distinct slugs", () => {
    const topics = [
      makeTopic({ name: "AI", slug: "ai" }),
      makeTopic({ name: "AI", slug: "ai-research" }),
    ];
    const result = dedupeTopics(topics);
    expect(result).toHaveLength(2);
  });

  it("returns an empty array for empty input", () => {
    expect(dedupeTopics([])).toEqual([]);
  });

  it("computes each topic's slug exactly once (no duplicate warn for empty-slug topics)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const topics = [makeTopic({ name: "Empty Slug Topic", slug: "" })];
    dedupeTopics(topics);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
