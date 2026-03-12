import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, act, waitFor } from "@testing-library/react"
import {
  SidebarCountsProvider,
  useSidebarCounts,
  useSidebarCountsOptional,
  getBadgeCount,
} from "@/contexts/sidebar-counts-context"

const mockGetDashboardStats = vi.fn()
vi.mock("@/app/actions/dashboard", () => ({
  getDashboardStats: (...args: unknown[]) => mockGetDashboardStats(...args),
}))

function TestConsumer() {
  const { subscriptionCount, savedCount, isLoading, refreshCounts } = useSidebarCounts()
  return (
    <div>
      <span data-testid="sub-count">{subscriptionCount}</span>
      <span data-testid="saved-count">{savedCount}</span>
      <span data-testid="loading">{isLoading ? "loading" : "done"}</span>
      <button data-testid="refresh" onClick={refreshCounts}>refresh</button>
    </div>
  )
}

describe("SidebarCountsProvider", () => {
  beforeEach(() => {
    mockGetDashboardStats.mockResolvedValue({
      subscriptionCount: 3,
      savedCount: 7,
      error: null,
    })
  })

  it("fetches counts on mount and exposes them via hook", async () => {
    render(
      <SidebarCountsProvider>
        <TestConsumer />
      </SidebarCountsProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("done")
    })

    expect(screen.getByTestId("sub-count").textContent).toBe("3")
    expect(screen.getByTestId("saved-count").textContent).toBe("7")
    expect(mockGetDashboardStats).toHaveBeenCalled()
  })

  it("shows loading state during fetch and done after", async () => {
    let resolve: (v: unknown) => void
    mockGetDashboardStats.mockReturnValue(
      new Promise((res) => {
        resolve = res
      })
    )

    render(
      <SidebarCountsProvider>
        <TestConsumer />
      </SidebarCountsProvider>
    )

    expect(screen.getByTestId("loading").textContent).toBe("loading")

    await act(async () => {
      resolve!({ subscriptionCount: 1, savedCount: 2, error: null })
    })

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("done")
    })
  })

  it("refreshCounts triggers refetch with fresh data", async () => {
    render(
      <SidebarCountsProvider>
        <TestConsumer />
      </SidebarCountsProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("done")
    })

    expect(screen.getByTestId("sub-count").textContent).toBe("3")

    const callsAfterMount = mockGetDashboardStats.mock.calls.length

    mockGetDashboardStats.mockResolvedValue({
      subscriptionCount: 5,
      savedCount: 10,
      error: null,
    })

    await act(async () => {
      screen.getByTestId("refresh").click()
    })

    await waitFor(() => {
      expect(screen.getByTestId("sub-count").textContent).toBe("5")
      expect(screen.getByTestId("saved-count").textContent).toBe("10")
    })

    expect(mockGetDashboardStats.mock.calls.length).toBe(callsAfterMount + 1)
  })

  it("handles getDashboardStats rejection gracefully", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    mockGetDashboardStats.mockRejectedValue(new Error("Network failure"))

    render(
      <SidebarCountsProvider>
        <TestConsumer />
      </SidebarCountsProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("done")
    })

    expect(screen.getByTestId("sub-count").textContent).toBe("0")
    expect(screen.getByTestId("saved-count").textContent).toBe("0")
    consoleError.mockRestore()
  })

  it("logs warning when getDashboardStats returns an error field", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {})
    mockGetDashboardStats.mockResolvedValue({
      subscriptionCount: 0,
      savedCount: 0,
      error: "You must be signed in",
    })

    render(
      <SidebarCountsProvider>
        <TestConsumer />
      </SidebarCountsProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("done")
    })

    expect(consoleWarn).toHaveBeenCalledWith(
      "[SidebarCounts] Server returned error:",
      "You must be signed in"
    )
    expect(screen.getByTestId("sub-count").textContent).toBe("0")
    consoleWarn.mockRestore()
  })
})

describe("useSidebarCounts", () => {
  it("throws when used outside provider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(() => {
      render(<TestConsumer />)
    }).toThrow("useSidebarCounts must be used within SidebarCountsProvider")

    consoleError.mockRestore()
  })
})

describe("useSidebarCountsOptional", () => {
  it("returns default counts with no-op refreshCounts when used outside provider", () => {
    function OptionalConsumer() {
      const { subscriptionCount, savedCount, isLoading, refreshCounts } = useSidebarCountsOptional()
      return (
        <div>
          <span data-testid="sub-count">{subscriptionCount}</span>
          <span data-testid="saved-count">{savedCount}</span>
          <span data-testid="loading">{isLoading ? "loading" : "done"}</span>
          <button data-testid="refresh" onClick={refreshCounts}>refresh</button>
        </div>
      )
    }

    render(<OptionalConsumer />)

    expect(screen.getByTestId("sub-count").textContent).toBe("0")
    expect(screen.getByTestId("saved-count").textContent).toBe("0")
    expect(screen.getByTestId("loading").textContent).toBe("done")
    // Should not throw when clicking (no-op)
    expect(() => screen.getByTestId("refresh").click()).not.toThrow()
  })
})

describe("getBadgeCount", () => {
  it("returns subscription count for /subscriptions when > 0", () => {
    expect(
      getBadgeCount("/subscriptions", { subscriptionCount: 5, savedCount: 0, isLoading: false })
    ).toBe(5)
  })

  it("returns saved count for /library when > 0", () => {
    expect(
      getBadgeCount("/library", { subscriptionCount: 0, savedCount: 3, isLoading: false })
    ).toBe(3)
  })

  it("returns null when loading", () => {
    expect(
      getBadgeCount("/subscriptions", { subscriptionCount: 5, savedCount: 3, isLoading: true })
    ).toBeNull()
  })

  it("returns null for unrelated routes", () => {
    expect(
      getBadgeCount("/dashboard", { subscriptionCount: 5, savedCount: 3, isLoading: false })
    ).toBeNull()
  })

  it("returns null when count is 0", () => {
    expect(
      getBadgeCount("/subscriptions", { subscriptionCount: 0, savedCount: 0, isLoading: false })
    ).toBeNull()
    expect(
      getBadgeCount("/library", { subscriptionCount: 0, savedCount: 0, isLoading: false })
    ).toBeNull()
  })
})
