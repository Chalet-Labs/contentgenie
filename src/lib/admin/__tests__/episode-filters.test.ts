import { describe, it, expect, vi } from "vitest";

vi.mock("@/db/schema", () => ({
  episodes: {
    podcastId: "podcast_id",
    transcriptStatus: "transcript_status",
    summaryStatus: "summary_status",
    publishDate: "publish_date",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => ({ and: args })),
  eq: vi.fn((col, val) => ({ eq: [col, val] })),
  gte: vi.fn((col, val) => ({ gte: [col, val] })),
  lte: vi.fn((col, val) => ({ lte: [col, val] })),
  inArray: vi.fn((col, vals) => ({ inArray: [col, vals] })),
}));

import { buildEpisodeWhereConditions } from "@/lib/admin/episode-filters";

describe("buildEpisodeWhereConditions", () => {
  it("returns undefined for empty filters", () => {
    const result = buildEpisodeWhereConditions({ page: 1 });
    expect(result).toBeUndefined();
  });

  it("adds status filter for transcriptStatuses", () => {
    const result = buildEpisodeWhereConditions({
      page: 1,
      transcriptStatuses: ["available", "failed"],
    });
    expect(result).toMatchObject({
      and: expect.arrayContaining([
        { inArray: [expect.anything(), ["available", "failed"]] },
      ]),
    });
  });

  it("adds date filters for dateFrom and dateTo", () => {
    const dateFrom = new Date("2026-01-01");
    const dateTo = new Date("2026-03-01");
    const result = buildEpisodeWhereConditions({ page: 1, dateFrom, dateTo });
    expect(result).toMatchObject({
      and: expect.arrayContaining([
        { gte: [expect.anything(), dateFrom] },
        { lte: [expect.anything(), expect.any(Date)] },
      ]),
    });
  });
});
