import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { TrendingTopics, TrendingTopicsLoading } from "@/components/dashboard/trending-topics"
import { slugify } from "@/lib/utils"
import type { TrendingTopic } from "@/db/schema"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_NOW = new Date("2026-03-15T12:00:00.000Z")
const fixedDate = new Date(MOCK_NOW.getTime() - 10 * 60 * 1000) // 10 minutes before MOCK_NOW

function makeTopic(overrides: Partial<TrendingTopic> = {}): TrendingTopic {
  const name = overrides.name ?? "Test Topic"
  return {
    name,
    description: "A test topic description",
    episodeCount: 5,
    episodeIds: [1, 2, 3, 4, 5],
    slug: slugify(name),
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

  it("renders each topic as a link to /trending/<slug>", () => {
    const topics = [
      makeTopic({ name: "AI" }),
      makeTopic({ name: "Climate" }),
      makeTopic({ name: "Tech" }),
    ]
    render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
    const links = screen.getAllByRole("link")
    expect(links.length).toBeGreaterThanOrEqual(3)
    for (const link of links) {
      expect(link).toHaveAttribute("href", expect.stringMatching(/^\/trending\//))
    }
    expect(screen.getByText("AI")).toBeInTheDocument()
    expect(screen.getByText("Climate")).toBeInTheDocument()
    expect(screen.getByText("Tech")).toBeInTheDocument()
  })

  it("renders topic description with line-clamp-2 class", () => {
    const topics = [makeTopic({ name: "AI", description: "AI is changing everything." })]
    render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
    const desc = screen.getByText("AI is changing everything.")
    expect(desc).toBeInTheDocument()
    expect(desc.className).toContain("line-clamp-2")
  })

  it("omits description paragraph when description is empty string", () => {
    const topics = [makeTopic({ name: "AI", description: "" })]
    const { container } = render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
    expect(screen.getByText("AI")).toBeInTheDocument()
    // No muted description paragraph should be present
    const descParagraphs = container.querySelectorAll("p.line-clamp-2")
    expect(descParagraphs).toHaveLength(0)
  })

  it("renders plural episode count: 'N episodes'", () => {
    const topics = [makeTopic({ name: "Robotics", episodeCount: 12 })]
    render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
    expect(screen.getByText("12 episodes")).toBeInTheDocument()
  })

  it("renders singular episode count: '1 episode'", () => {
    const topics = [makeTopic({ name: "Solo Topic", episodeCount: 1 })]
    render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
    expect(screen.getByText("1 episode")).toBeInTheDocument()
  })

  it("renders '0 episodes' for episodeCount of 0", () => {
    const topics = [makeTopic({ name: "Empty Topic", episodeCount: 0 })]
    render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
    expect(screen.getByText("0 episodes")).toBeInTheDocument()
  })

  it("topic name element has no truncate class", () => {
    const longName = "This Is A Very Long Topic Name That Would Overflow In A Pill"
    const topics = [makeTopic({ name: longName, episodeCount: 3 })]
    render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
    const nameEl = screen.getByText(longName)
    expect(nameEl.className).not.toContain("truncate")
    expect(nameEl.className).not.toContain("line-clamp-1")
  })

  it("displays card title 'Trending Topics' and subline 'Past 7 days · Updated 10m ago'", () => {
    const topics = [makeTopic({ name: "AI" })]
    render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
    expect(screen.getByText("Trending Topics")).toBeInTheDocument()
    expect(screen.getByText(/Past 7 days · Updated 10m ago/)).toBeInTheDocument()
  })

  it("renders a single topic correctly", () => {
    const topics = [makeTopic({ name: "Solo Topic", episodeCount: 1 })]
    render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
    expect(screen.getByText("Solo Topic")).toBeInTheDocument()
    expect(screen.getByText("1 episode")).toBeInTheDocument()
  })

  it("deduplicates topics with the same slug", () => {
    const topics = [
      makeTopic({ name: "AI", slug: "ai" }),
      makeTopic({ name: "AI", slug: "ai" }),
      makeTopic({ name: "Tech", slug: "tech" }),
    ]
    render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
    expect(screen.getAllByText("AI")).toHaveLength(1)
  })

  it("defensive fallback: empty slug falls back to slugify(name) for href", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const topics = [makeTopic({ name: "No Slug Topic", slug: "" })]
    render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
    const link = screen.getByRole("link", { name: /No Slug Topic/ })
    expect(link).toHaveAttribute("href", "/trending/no-slug-topic")
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it("renders nothing when topics array is empty", () => {
    const { container } = render(<TrendingTopics topics={[]} generatedAt={fixedDate} />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText("Trending Topics")).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// TrendingTopicsLoading
// ---------------------------------------------------------------------------

describe("TrendingTopicsLoading", () => {
  it("renders inside a Card with row-shaped skeleton placeholders (no rounded-full pills)", () => {
    const { container } = render(<TrendingTopicsLoading />)
    expect(container.firstChild).toBeInTheDocument()
    // Must NOT have any rounded-full pill skeletons
    const pillSkeletons = container.querySelectorAll("[class*='rounded-full']")
    expect(pillSkeletons).toHaveLength(0)
    // Must have at least one row-shaped placeholder group
    const rowGroups = container.querySelectorAll("div.flex.items-start")
    expect(rowGroups.length).toBeGreaterThanOrEqual(1)
  })
})
