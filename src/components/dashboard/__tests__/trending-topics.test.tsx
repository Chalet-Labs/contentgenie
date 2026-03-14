import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { TrendingTopics, TrendingTopicsLoading } from "@/components/dashboard/trending-topics"
import type { TrendingTopic } from "@/db/schema"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_NOW = new Date("2026-03-15T12:00:00.000Z")
const fixedDate = new Date(MOCK_NOW.getTime() - 10 * 60 * 1000) // 10 minutes before MOCK_NOW

function makeTopic(overrides: Partial<TrendingTopic> = {}): TrendingTopic {
  return {
    name: "Test Topic",
    description: "A test topic description",
    episodeCount: 5,
    episodeIds: [1, 2, 3, 4, 5],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// TrendingTopics
// ---------------------------------------------------------------------------

describe("TrendingTopics", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(MOCK_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("renders correct number of pills for N topics", () => {
    const topics = [
      makeTopic({ name: "AI" }),
      makeTopic({ name: "Climate" }),
      makeTopic({ name: "Tech" }),
    ]
    render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
    expect(screen.getByText("AI")).toBeInTheDocument()
    expect(screen.getByText("Climate")).toBeInTheDocument()
    expect(screen.getByText("Tech")).toBeInTheDocument()
  })

  it("each pill shows 'Name (episodeCount)' format", () => {
    const topics = [
      makeTopic({ name: "Robotics", episodeCount: 12 }),
      makeTopic({ name: "Space", episodeCount: 7 }),
    ]
    render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
    expect(screen.getByText("Robotics")).toBeInTheDocument()
    expect(screen.getByText("(12)")).toBeInTheDocument()
    expect(screen.getByText("Space")).toBeInTheDocument()
    expect(screen.getByText("(7)")).toBeInTheDocument()
  })

  it("renders a single topic correctly", () => {
    const topics = [makeTopic({ name: "Solo Topic", episodeCount: 1 })]
    render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
    expect(screen.getByText("Solo Topic")).toBeInTheDocument()
    expect(screen.getByText("(1)")).toBeInTheDocument()
  })

  it("renders episodeCount of 0 without crashing", () => {
    const topics = [makeTopic({ name: "Empty Topic", episodeCount: 0 })]
    render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
    expect(screen.getByText("Empty Topic")).toBeInTheDocument()
    expect(screen.getByText("(0)")).toBeInTheDocument()
  })

  it("long topic name pill has title attribute for accessibility", () => {
    const longName = "This Is A Very Long Topic Name That Would Overflow"
    const topics = [makeTopic({ name: longName, episodeCount: 3 })]
    render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
    const nameSpan = screen.getByTitle(longName)
    expect(nameSpan).toBeInTheDocument()
  })

  it("displays deterministic subtitle with relative time", () => {
    const topics = [makeTopic({ name: "AI" })]
    render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
    expect(screen.getByText(/Updated 10m ago/)).toBeInTheDocument()
    expect(screen.getByText(/Past 7 days/)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// TrendingTopicsLoading
// ---------------------------------------------------------------------------

describe("TrendingTopicsLoading", () => {
  it("renders 6 pill-shaped skeleton placeholders", () => {
    const { container } = render(<TrendingTopicsLoading />)
    expect(container.firstChild).toBeInTheDocument()
    const skeletons = container.querySelectorAll("[class*='rounded-full']")
    expect(skeletons).toHaveLength(6)
  })
})
