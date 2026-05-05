import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PodcastIndexEpisodeId } from "@/types/ids";
import type { CanonicalOverlapResult } from "@/lib/topic-overlap";

vi.mock("@/app/actions/dashboard", () => ({
  getCanonicalTopicOverlaps: vi.fn(),
}));

const makeId = (n: number) => `ep-${n}` as PodcastIndexEpisodeId;
const makeRepeat = (n: number): CanonicalOverlapResult => ({
  kind: "repeat",
  count: n,
  topicLabel: `topic-${n}`,
  topicId: n,
});

describe("fetchCanonicalOverlapsBatched", () => {
  let getCanonicalTopicOverlaps: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mod = await import("@/app/actions/dashboard");
    getCanonicalTopicOverlaps = mod.getCanonicalTopicOverlaps as ReturnType<
      typeof vi.fn
    >;
    getCanonicalTopicOverlaps.mockReset();
  });

  it("returns empty object and makes no fetch for empty input", async () => {
    const { fetchCanonicalOverlapsBatched } =
      await import("@/lib/canonical-overlap-batching");
    const result = await fetchCanonicalOverlapsBatched([]);
    expect(result).toEqual({});
    expect(getCanonicalTopicOverlaps).not.toHaveBeenCalled();
  });

  it("makes a single call for ≤500 ids", async () => {
    const ids = Array.from({ length: 300 }, (_, i) => makeId(i));
    const data: Record<PodcastIndexEpisodeId, CanonicalOverlapResult | null> =
      {};
    ids.forEach((id) => (data[id] = makeRepeat(1)));
    getCanonicalTopicOverlaps.mockResolvedValue({ success: true, data });

    const { fetchCanonicalOverlapsBatched } =
      await import("@/lib/canonical-overlap-batching");
    const result = await fetchCanonicalOverlapsBatched(ids);

    expect(getCanonicalTopicOverlaps).toHaveBeenCalledTimes(1);
    expect(getCanonicalTopicOverlaps).toHaveBeenCalledWith(ids);
    expect(Object.keys(result).length).toBe(300);
  });

  it("splits 1100 ids into 3 calls (500+500+100) and merges results", async () => {
    const ids = Array.from({ length: 1100 }, (_, i) => makeId(i));

    getCanonicalTopicOverlaps.mockImplementation(
      async (chunk: PodcastIndexEpisodeId[]) => {
        const data: Record<
          PodcastIndexEpisodeId,
          CanonicalOverlapResult | null
        > = {};
        chunk.forEach((id) => (data[id] = makeRepeat(1)));
        return { success: true, data };
      },
    );

    const { fetchCanonicalOverlapsBatched } =
      await import("@/lib/canonical-overlap-batching");
    const result = await fetchCanonicalOverlapsBatched(ids);

    expect(getCanonicalTopicOverlaps).toHaveBeenCalledTimes(3);
    const callLengths = getCanonicalTopicOverlaps.mock.calls.map(
      (c: unknown[]) => (c[0] as PodcastIndexEpisodeId[]).length,
    );
    expect(callLengths).toEqual([500, 500, 100]);
    expect(Object.keys(result).length).toBe(1100);
  });

  it("returns successfully-fetched chunks when one chunk fails", async () => {
    const ids = Array.from({ length: 600 }, (_, i) => makeId(i));
    const firstChunk = ids.slice(0, 500);

    getCanonicalTopicOverlaps
      .mockResolvedValueOnce({
        success: true,
        data: Object.fromEntries(
          firstChunk.map((id) => [id, makeRepeat(1)]),
        ) as Record<PodcastIndexEpisodeId, CanonicalOverlapResult | null>,
      })
      .mockResolvedValueOnce({ success: false, error: "DB error" });

    const { fetchCanonicalOverlapsBatched } =
      await import("@/lib/canonical-overlap-batching");
    const result = await fetchCanonicalOverlapsBatched(ids);

    expect(Object.keys(result).length).toBe(500);
    firstChunk.forEach((id) => {
      expect(result[id]).toEqual(makeRepeat(1));
    });
  });
});
