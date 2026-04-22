import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  TrendingTopics,
  TrendingTopicsLoading,
  TOPICS_INITIAL,
} from "@/components/dashboard/trending-topics"
import { makeTopic } from "@/test/trending-factories"

const MOCK_NOW = new Date("2026-03-15T12:00:00.000Z")
const fixedDate = new Date(MOCK_NOW.getTime() - 10 * 60 * 1000) // 10 minutes before MOCK_NOW

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
    expect(links).toHaveLength(3)
    expect(links[0]).toHaveAttribute("href", "/trending/ai")
    expect(links[1]).toHaveAttribute("href", "/trending/climate")
    expect(links[2]).toHaveAttribute("href", "/trending/tech")
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

  it("renders empty-state card when topics array is empty", () => {
    render(<TrendingTopics topics={[]} generatedAt={fixedDate} />)
    // Card chrome is still present so a missed cron isn't indistinguishable from a disabled feature
    expect(screen.getByText("Trending Topics")).toBeInTheDocument()
    expect(screen.getByText(/No trending topics yet/)).toBeInTheDocument()
    expect(screen.queryAllByRole("link")).toHaveLength(0)
  })

  it("does not show stale copy or warning color when isStale is false (default)", () => {
    const topics = [makeTopic({ name: "AI" })]
    render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
    const desc = screen.getByText(/Past 7 days · Updated 10m ago/)
    expect(desc.textContent).not.toMatch(/Out of date/)
    expect(desc.className).not.toContain("text-amber-600")
  })

  it("renders 'Out of date' suffix and amber warning color when isStale is true", () => {
    const topics = [makeTopic({ name: "AI" })]
    render(<TrendingTopics topics={topics} generatedAt={fixedDate} isStale />)
    const desc = screen.getByText(/Past 7 days · Updated 10m ago · Out of date/)
    expect(desc).toBeInTheDocument()
    expect(desc.className).toContain("text-amber-600")
  })

  it("shows stale warning alongside empty-state when both conditions hold", () => {
    render(<TrendingTopics topics={[]} generatedAt={fixedDate} isStale />)
    expect(screen.getByText(/No trending topics yet/)).toBeInTheDocument()
    expect(screen.getByText(/Out of date/)).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Show more / Show less toggle (no fake timers — userEvent needs real ones)
  // -------------------------------------------------------------------------

  describe("toggle behaviour", () => {
    beforeEach(() => {
      vi.useRealTimers()
    })

    afterEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(MOCK_NOW)
    })

    it("renders only TOPICS_INITIAL topics when more than TOPICS_INITIAL are provided and not expanded", () => {
      const topics = Array.from({ length: TOPICS_INITIAL + 1 }, (_, i) =>
        makeTopic({ name: `Topic ${i}`, slug: `topic-${i}` })
      )
      render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
      const links = screen.getAllByRole("link")
      expect(links).toHaveLength(TOPICS_INITIAL)
    })

    it("shows all topics after clicking the expand button", async () => {
      const total = TOPICS_INITIAL + 2
      const topics = Array.from({ length: total }, (_, i) =>
        makeTopic({ name: `Topic ${i}`, slug: `topic-${i}` })
      )
      render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)

      const user = userEvent.setup()
      await user.click(screen.getByRole("button", { name: /show.*more/i }))

      const links = screen.getAllByRole("link")
      expect(links).toHaveLength(total)
    })

    it("shows 'Show less' button after expanding and re-collapses when clicked", async () => {
      const hidden = 2
      const topics = Array.from({ length: TOPICS_INITIAL + hidden }, (_, i) =>
        makeTopic({ name: `Topic ${i}`, slug: `topic-${i}` })
      )
      render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)

      const user = userEvent.setup()
      await user.click(screen.getByRole("button", { name: /show.*more/i }))

      const lessBtn = screen.getByRole("button", { name: /show less/i })
      expect(lessBtn).toBeInTheDocument()

      await user.click(lessBtn)

      const links = screen.getAllByRole("link")
      expect(links).toHaveLength(TOPICS_INITIAL)
      expect(screen.queryByRole("button", { name: /show less/i })).not.toBeInTheDocument()
      // Re-collapse restores the original "Show N more" label with the correct count
      expect(
        screen.getByRole("button", { name: `Show ${hidden} more` })
      ).toBeInTheDocument()
    })

    it("toggle button reports aria-expanded state accurately through expand/collapse", async () => {
      const topics = Array.from({ length: TOPICS_INITIAL + 2 }, (_, i) =>
        makeTopic({ name: `Topic ${i}`, slug: `topic-${i}` })
      )
      render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)

      const user = userEvent.setup()
      const initial = screen.getByRole("button", { name: /show.*more/i })
      expect(initial).toHaveAttribute("aria-expanded", "false")

      await user.click(initial)
      expect(screen.getByRole("button", { name: /show less/i })).toHaveAttribute(
        "aria-expanded",
        "true"
      )
    })

    it("toggle button is absent when deduped topics count < TOPICS_INITIAL", () => {
      const topics = Array.from({ length: TOPICS_INITIAL - 1 }, (_, i) =>
        makeTopic({ name: `Topic ${i}`, slug: `topic-${i}` })
      )
      render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
      expect(screen.queryByRole("button", { name: /show/i })).not.toBeInTheDocument()
    })

    it("toggle button is absent when exactly TOPICS_INITIAL deduplicated topics are provided (boundary: N > N is false)", () => {
      const topics = Array.from({ length: TOPICS_INITIAL }, (_, i) =>
        makeTopic({ name: `Topic ${i}`, slug: `topic-${i}` })
      )
      render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
      expect(screen.queryByRole("button", { name: /show/i })).not.toBeInTheDocument()
    })

    it("toggle button label shows correct hidden count", () => {
      const hidden = 3
      const topics = Array.from({ length: TOPICS_INITIAL + hidden }, (_, i) =>
        makeTopic({ name: `Topic ${i}`, slug: `topic-${i}` })
      )
      render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
      expect(
        screen.getByRole("button", { name: `Show ${hidden} more` })
      ).toBeInTheDocument()
    })

    it("renders 'Show 1 more' when exactly TOPICS_INITIAL + 1 topics are provided (singular-count boundary)", () => {
      const topics = Array.from({ length: TOPICS_INITIAL + 1 }, (_, i) =>
        makeTopic({ name: `Topic ${i}`, slug: `topic-${i}` })
      )
      render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
      expect(screen.getByRole("button", { name: "Show 1 more" })).toBeInTheDocument()
    })

    it("toggle button is absent when raw topics exceed threshold but deduped count does not", () => {
      // Raw length > TOPICS_INITIAL, but after dedupeTopics collapses duplicate slugs,
      // the visible count is <= TOPICS_INITIAL and the toggle must stay hidden.
      const uniqueSlugs = Math.max(TOPICS_INITIAL - 1, 1)
      const uniqueTopics = Array.from({ length: uniqueSlugs }, (_, i) =>
        makeTopic({ name: `Topic ${i}`, slug: `topic-${i}` })
      )
      const duplicates = Array.from({ length: 3 }, () =>
        makeTopic({ name: "Topic 0", slug: "topic-0" })
      )
      const topics = [...uniqueTopics, ...duplicates]
      expect(topics.length).toBeGreaterThan(TOPICS_INITIAL)
      render(<TrendingTopics topics={topics} generatedAt={fixedDate} />)
      expect(screen.queryByRole("button", { name: /show/i })).not.toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// TrendingTopicsLoading
// ---------------------------------------------------------------------------

describe("TrendingTopicsLoading", () => {
  it("renders TOPICS_INITIAL row-shaped skeleton placeholders", () => {
    render(<TrendingTopicsLoading />)
    expect(screen.getAllByTestId("trending-loading-row")).toHaveLength(TOPICS_INITIAL)
  })
})
