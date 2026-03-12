import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, act, waitFor } from "@testing-library/react"
import { SidebarCountsProvider, useSidebarCounts } from "@/contexts/sidebar-counts-context"

// usePathname is mocked globally in setup.ts to return "/".
// We re-mock here so individual tests can control the value.
const mockUsePathname = vi.fn().mockReturnValue("/")
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}))

const mockGetDashboardStats = vi.fn()
vi.mock("@/app/actions/dashboard", () => ({
  getDashboardStats: (...args: unknown[]) => mockGetDashboardStats(...args),
}))

function TestConsumer() {
  const { subscriptionCount, savedCount, isLoading } = useSidebarCounts()
  return (
    <div>
      <span data-testid="sub-count">{subscriptionCount}</span>
      <span data-testid="saved-count">{savedCount}</span>
      <span data-testid="loading">{isLoading ? "loading" : "done"}</span>
    </div>
  )
}

describe("SidebarCountsProvider", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/")
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
    expect(mockGetDashboardStats).toHaveBeenCalledTimes(1)
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

  it("re-fetches when pathname changes", async () => {
    mockUsePathname.mockReturnValue("/dashboard")

    const { rerender } = render(
      <SidebarCountsProvider>
        <TestConsumer />
      </SidebarCountsProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("done")
    })

    const callsAfterMount = mockGetDashboardStats.mock.calls.length

    mockUsePathname.mockReturnValue("/subscriptions")
    mockGetDashboardStats.mockResolvedValue({
      subscriptionCount: 5,
      savedCount: 10,
      error: null,
    })

    rerender(
      <SidebarCountsProvider>
        <TestConsumer />
      </SidebarCountsProvider>
    )

    await waitFor(() => {
      expect(mockGetDashboardStats.mock.calls.length).toBeGreaterThan(callsAfterMount)
    })

    await waitFor(() => {
      expect(screen.getByTestId("sub-count").textContent).toBe("5")
      expect(screen.getByTestId("saved-count").textContent).toBe("10")
    })
  })
})

describe("useSidebarCounts", () => {
  it("throws when used outside provider", () => {
    // Suppress the expected React error boundary console output
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(() => {
      render(<TestConsumer />)
    }).toThrow("useSidebarCounts must be used within SidebarCountsProvider")

    consoleError.mockRestore()
  })
})
