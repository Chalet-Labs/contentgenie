import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { Sidebar } from "@/components/layout/sidebar"

const mockUseSidebarCounts = vi.fn()
vi.mock("@/contexts/sidebar-counts-context", () => ({
  useSidebarCounts: () => mockUseSidebarCounts(),
}))

// OrganizationSwitcher is already mocked via @clerk/nextjs in setup.ts,
// but it's not exported — mock the whole module for layout tests.
vi.mock("@clerk/nextjs", () => ({
  OrganizationSwitcher: () => null,
}))

describe("Sidebar", () => {
  beforeEach(() => {
    mockUseSidebarCounts.mockReturnValue({
      subscriptionCount: 0,
      savedCount: 0,
      isLoading: false,
    })
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
})
