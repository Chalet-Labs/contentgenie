import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { TrendingTopics, TrendingTopicsLoading } from "@/components/dashboard/trending-topics"
import type { TrendingTopic } from "@/db/schema"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTopic(overrides: Partial<TrendingTopic> = {}): TrendingTopic {
  return {
    name: "Test Topic",
    description: "A test topic description",
    episodeCount: 5,
    episodeIds: [1, 2, 3, 4, 5],
    ...overrides,
  }
}

const fixedDate = new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago

// ---------------------------------------------------------------------------
// TrendingTopics
// ---------------------------------------------------------------------------

describe("TrendingTopics", () => {
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
})

// ---------------------------------------------------------------------------
// TrendingTopicsLoading
// ---------------------------------------------------------------------------

describe("TrendingTopicsLoading", () => {
  it("renders without crashing", () => {
    const { container } = render(<TrendingTopicsLoading />)
    expect(container.firstChild).toBeInTheDocument()
  })
})
