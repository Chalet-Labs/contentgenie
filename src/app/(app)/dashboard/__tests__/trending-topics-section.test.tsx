import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { isValidElement } from "react"
import type { TrendingTopic } from "@/db/schema"

const mockGetTrendingTopics = vi.fn()

vi.mock("@/app/actions/dashboard", () => ({
  getTrendingTopics: () => mockGetTrendingTopics(),
}))

import { TrendingTopicsSection } from "@/app/(app)/dashboard/trending-topics-section"

function makeTopic(name: string): TrendingTopic {
  return {
    name,
    description: `${name} description`,
    episodeCount: 3,
    episodeIds: [1, 2, 3],
    slug: name.toLowerCase(),
  }
}

describe("TrendingTopicsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-18T12:00:00Z"))
  })

  it("returns null when no snapshot exists (first-run dashboard)", async () => {
    mockGetTrendingTopics.mockResolvedValue({ topics: null, error: null })

    const result = await TrendingTopicsSection()

    expect(result).toBeNull()
  })

  it("returns null when the server action errors out", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      mockGetTrendingTopics.mockResolvedValue({
        topics: null,
        error: "Failed to load trending topics",
      })

      const result = await TrendingTopicsSection()

      expect(result).toBeNull()
      expect(errorSpy).toHaveBeenCalledWith(
        "[TrendingTopicsSection]",
        "Failed to load trending topics",
      )
    } finally {
      errorSpy.mockRestore()
    }
  })

  it("renders with isStale=false for a fresh snapshot", async () => {
    const generatedAt = new Date("2026-04-18T11:30:00Z") // 30 minutes ago
    mockGetTrendingTopics.mockResolvedValue({
      topics: {
        items: [makeTopic("AI")],
        generatedAt,
        periodStart: new Date("2026-04-11T11:30:00Z"),
        periodEnd: generatedAt,
        episodeCount: 42,
      },
      error: null,
    })

    const result = await TrendingTopicsSection()

    expect(isValidElement(result)).toBe(true)
    const props = (result as { props: { isStale: boolean; topics: TrendingTopic[] } }).props
    expect(props.isStale).toBe(false)
    expect(props.topics).toHaveLength(1)
  })

  it("renders with isStale=true for a snapshot older than 48h", async () => {
    const generatedAt = new Date("2026-04-15T12:00:00Z") // 3 days ago
    mockGetTrendingTopics.mockResolvedValue({
      topics: {
        items: [makeTopic("AI")],
        generatedAt,
        periodStart: new Date("2026-04-08T12:00:00Z"),
        periodEnd: generatedAt,
        episodeCount: 42,
      },
      error: null,
    })

    const result = await TrendingTopicsSection()

    const props = (result as { props: { isStale: boolean } }).props
    expect(props.isStale).toBe(true)
  })

  it("renders the card even when the snapshot has zero topics", async () => {
    const generatedAt = new Date("2026-04-18T11:30:00Z")
    mockGetTrendingTopics.mockResolvedValue({
      topics: {
        items: [],
        generatedAt,
        periodStart: new Date("2026-04-11T11:30:00Z"),
        periodEnd: generatedAt,
        episodeCount: 0,
      },
      error: null,
    })

    const result = await TrendingTopicsSection()

    render(result as React.ReactElement)
    // The component renders the empty-state card rather than null
    expect(screen.getByText("Trending Topics")).toBeInTheDocument()
    expect(screen.getByText(/No trending topics yet/)).toBeInTheDocument()
  })

  it("surfaces stale + empty together (both UX affordances visible)", async () => {
    const generatedAt = new Date("2026-04-15T12:00:00Z") // 3 days ago, empty
    mockGetTrendingTopics.mockResolvedValue({
      topics: {
        items: [],
        generatedAt,
        periodStart: new Date("2026-04-08T12:00:00Z"),
        periodEnd: generatedAt,
        episodeCount: 0,
      },
      error: null,
    })

    const result = await TrendingTopicsSection()

    render(result as React.ReactElement)
    expect(screen.getByText(/No trending topics yet/)).toBeInTheDocument()
    expect(screen.getByText(/Out of date/)).toBeInTheDocument()
  })
})
