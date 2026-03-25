import { describe, it, expect, vi } from "vitest"

vi.mock("@/db/schema", () => ({
  episodes: {
    podcastId: "podcast_id",
    transcriptStatus: "transcript_status",
    summaryStatus: "summary_status",
    publishDate: "publish_date",
  },
}))

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => ({ and: args })),
  eq: vi.fn((col, val) => ({ eq: [col, val] })),
  gte: vi.fn((col, val) => ({ gte: [col, val] })),
  lte: vi.fn((col, val) => ({ lte: [col, val] })),
  inArray: vi.fn((col, vals) => ({ inArray: [col, vals] })),
}))

import { parseEpisodeFilters, buildEpisodeWhereConditions } from "../episode-filters"

describe("parseEpisodeFilters", () => {
  it("defaults page to 1 when not provided", () => {
    const result = parseEpisodeFilters({})
    expect(result.page).toBe(1)
  })

  it("defaults page to 1 for invalid page values", () => {
    expect(parseEpisodeFilters({ page: "0" }).page).toBe(1)
    expect(parseEpisodeFilters({ page: "-1" }).page).toBe(1)
    expect(parseEpisodeFilters({ page: "abc" }).page).toBe(1)
  })

  it("parses valid page number", () => {
    expect(parseEpisodeFilters({ page: "3" }).page).toBe(3)
  })

  it("parses multi-value transcript status params", () => {
    const result = parseEpisodeFilters({ transcriptStatus: ["available", "failed"] })
    expect(result.transcriptStatuses).toEqual(["available", "failed"])
  })

  it("parses single transcript status as array", () => {
    const result = parseEpisodeFilters({ transcriptStatus: "available" })
    expect(result.transcriptStatuses).toEqual(["available"])
  })

  it("ignores unknown params", () => {
    const result = parseEpisodeFilters({ unknown: "value", foo: "bar" })
    expect(result.podcastId).toBeUndefined()
    expect(result.transcriptStatuses).toBeUndefined()
  })

  it("parses podcastId", () => {
    const result = parseEpisodeFilters({ podcastId: "42" })
    expect(result.podcastId).toBe(42)
  })
})

describe("buildEpisodeWhereConditions", () => {
  it("returns undefined for empty filters", () => {
    const result = buildEpisodeWhereConditions({ page: 1 })
    expect(result).toBeUndefined()
  })

  it("adds status filter for transcriptStatuses", () => {
    const result = buildEpisodeWhereConditions({
      page: 1,
      transcriptStatuses: ["available", "failed"],
    })
    expect(result).toBeDefined()
  })

  it("adds date filters for dateFrom and dateTo", () => {
    const dateFrom = new Date("2026-01-01")
    const dateTo = new Date("2026-03-01")
    const result = buildEpisodeWhereConditions({ page: 1, dateFrom, dateTo })
    expect(result).toBeDefined()
  })
})
