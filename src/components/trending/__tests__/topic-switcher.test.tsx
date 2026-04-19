import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { TopicSwitcher } from "@/components/trending/topic-switcher"
import type { TrendingTopic } from "@/db/schema"

function makeTopic(overrides: Partial<TrendingTopic> = {}): TrendingTopic {
  return {
    name: "Test Topic",
    description: "A test description",
    episodeCount: 5,
    episodeIds: [1, 2, 3],
    slug: "test-topic",
    ...overrides,
  }
}

const topics: TrendingTopic[] = [
  makeTopic({ name: "Artificial Intelligence", slug: "artificial-intelligence" }),
  makeTopic({ name: "Climate Policy", slug: "climate-policy" }),
  makeTopic({ name: "Startup Funding", slug: "startup-funding" }),
]

describe("TopicSwitcher", () => {
  it("renders one pill per topic", () => {
    render(<TopicSwitcher topics={topics} activeSlug="artificial-intelligence" />)
    expect(screen.getByText("Artificial Intelligence")).toBeInTheDocument()
    expect(screen.getByText("Climate Policy")).toBeInTheDocument()
    expect(screen.getByText("Startup Funding")).toBeInTheDocument()
  })

  it("active pill has bg-primary class", () => {
    render(<TopicSwitcher topics={topics} activeSlug="climate-policy" />)
    const activeLink = screen.getByRole("link", { name: "Climate Policy" })
    expect(activeLink.className).toContain("bg-primary")
  })

  it("inactive pills have bg-muted class", () => {
    render(<TopicSwitcher topics={topics} activeSlug="climate-policy" />)
    const inactiveLink = screen.getByRole("link", { name: "Artificial Intelligence" })
    expect(inactiveLink.className).toContain("bg-muted")
  })

  it("hrefs resolve to /trending/{slug}", () => {
    render(<TopicSwitcher topics={topics} activeSlug="artificial-intelligence" />)
    const link = screen.getByRole("link", { name: "Climate Policy" })
    expect(link).toHaveAttribute("href", "/trending/climate-policy")
  })

  it("legacy topic missing slug uses slugify(name) for href", () => {
    const legacyTopic = makeTopic({ name: "Space Exploration", slug: undefined as unknown as string })
    render(<TopicSwitcher topics={[legacyTopic]} activeSlug="space-exploration" />)
    const link = screen.getByRole("link", { name: "Space Exploration" })
    expect(link).toHaveAttribute("href", "/trending/space-exploration")
  })

  it("legacy topic missing slug is matched as active via slugify(name)", () => {
    const legacyTopic = makeTopic({ name: "Space Exploration", slug: undefined as unknown as string })
    render(<TopicSwitcher topics={[legacyTopic]} activeSlug="space-exploration" />)
    const link = screen.getByRole("link", { name: "Space Exploration" })
    expect(link.className).toContain("bg-primary")
  })

  it("empty topics array renders nothing", () => {
    const { container } = render(<TopicSwitcher topics={[]} activeSlug="anything" />)
    expect(container.firstChild).toBeNull()
  })

  it("dedupes topics with the same slug and keeps distinct slugs separate", () => {
    const topics = [
      makeTopic({ name: "AI", slug: "ai" }),
      makeTopic({ name: "AI", slug: "ai" }), // same slug → dedupe
      makeTopic({ name: "AI", slug: "ai-regulation" }), // same name, different slug → keep
      makeTopic({ name: "Climate", slug: "climate" }),
    ]
    render(<TopicSwitcher topics={topics} activeSlug="climate" />)
    const aiLinks = screen.getAllByRole("link", { name: "AI" })
    expect(aiLinks).toHaveLength(2)
    expect(aiLinks[0]).toHaveAttribute("href", "/trending/ai")
    expect(aiLinks[1]).toHaveAttribute("href", "/trending/ai-regulation")
  })
})
