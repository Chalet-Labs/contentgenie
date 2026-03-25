import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { Sidebar } from "@/components/layout/sidebar"

const mockUseSidebarCounts = vi.fn()
vi.mock("@/contexts/sidebar-counts-context", () => ({
  useSidebarCounts: () => mockUseSidebarCounts(),
  getBadgeCount: (
    href: string,
    counts: { subscriptionCount: number; savedCount: number; isLoading: boolean }
  ): number | null => {
    if (counts.isLoading) return null
    if (href === "/subscriptions" && counts.subscriptionCount > 0) return counts.subscriptionCount
    if (href === "/library" && counts.savedCount > 0) return counts.savedCount
    return null
  },
  NavBadge: ({ count }: { count: number }) => <span>{count > 99 ? "99+" : count}</span>,
}))

const mockHas = vi.fn()

// OrganizationSwitcher is already mocked via @clerk/nextjs in setup.ts,
// but it's not exported — mock the whole module for layout tests.
vi.mock("@clerk/nextjs", () => ({
  OrganizationSwitcher: () => null,
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "test-user-id",
    has: mockHas,
  }),
}))

describe("Sidebar", () => {
  beforeEach(() => {
    mockUseSidebarCounts.mockReturnValue({
      subscriptionCount: 0,
      savedCount: 0,
      isLoading: false,
    })
    mockHas.mockReturnValue(false)
  })

  it("shows badge on Subscriptions link when subscriptionCount > 0", () => {
    mockUseSidebarCounts.mockReturnValue({
      subscriptionCount: 5,
      savedCount: 0,
      isLoading: false,
    })

    render(<Sidebar />)

    const subscriptionsLink = screen.getByRole("link", { name: /subscriptions/i })
    expect(subscriptionsLink).toHaveTextContent("5")
  })

  it("shows badge on Library link when savedCount > 0", () => {
    mockUseSidebarCounts.mockReturnValue({
      subscriptionCount: 0,
      savedCount: 12,
      isLoading: false,
    })

    render(<Sidebar />)

    const libraryLink = screen.getByRole("link", { name: /library/i })
    expect(libraryLink).toHaveTextContent("12")
  })

  it("does not show badge when counts are 0", () => {
    mockUseSidebarCounts.mockReturnValue({
      subscriptionCount: 0,
      savedCount: 0,
      isLoading: false,
    })

    render(<Sidebar />)

    const subscriptionsLink = screen.getByRole("link", { name: /subscriptions/i })
    const libraryLink = screen.getByRole("link", { name: /library/i })

    expect(subscriptionsLink.querySelector("span")).toBeNull()
    expect(libraryLink.querySelector("span")).toBeNull()
  })

  it("does not show badge while loading", () => {
    mockUseSidebarCounts.mockReturnValue({
      subscriptionCount: 10,
      savedCount: 20,
      isLoading: true,
    })

    render(<Sidebar />)

    const subscriptionsLink = screen.getByRole("link", { name: /subscriptions/i })
    const libraryLink = screen.getByRole("link", { name: /library/i })

    expect(subscriptionsLink.querySelector("span")).toBeNull()
    expect(libraryLink.querySelector("span")).toBeNull()
  })

  it("shows Admin link when user has admin role", () => {
    mockHas.mockReturnValue(true)
    render(<Sidebar />)
    expect(screen.getByRole("link", { name: /admin/i })).toBeInTheDocument()
  })

  it("does not show Admin link when user is not admin", () => {
    mockHas.mockReturnValue(false)
    render(<Sidebar />)
    expect(screen.queryByRole("link", { name: /admin/i })).not.toBeInTheDocument()
  })
})
