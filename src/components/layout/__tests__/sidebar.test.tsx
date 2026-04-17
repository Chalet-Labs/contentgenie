import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within, fireEvent } from "@testing-library/react"
import { Sidebar } from "@/components/layout/sidebar"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { ADMIN_ROLE } from "@/lib/auth-roles"

const mockUseSidebarCounts = vi.fn()
const mockUsePathname = vi.fn(() => "/")

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))

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

vi.mock("@clerk/nextjs", () => ({
  OrganizationSwitcher: () => <div data-testid="org-switcher" />,
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "test-user-id",
    has: mockHas,
  }),
}))

vi.mock("@/components/ui/sheet", async () => {
  const { createSheetMock } = await vi.importActual<typeof import("@/test/mocks/sheet")>(
    "@/test/mocks/sheet"
  )
  return createSheetMock()
})

beforeEach(() => {
  mockUseSidebarCounts.mockReturnValue({
    subscriptionCount: 0,
    savedCount: 0,
    isLoading: false,
  })
  mockHas.mockReturnValue(false)
  mockUsePathname.mockReturnValue("/")
})

describe("Sidebar — inline aside mode", () => {
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

  it("renders OrganizationSwitcher in inline mode", () => {
    render(<Sidebar />)
    expect(screen.getByTestId("org-switcher")).toBeInTheDocument()
  })
})

const renderSidebarInOpenSheet = () => {
  const result = render(
    <Sheet>
      <SheetTrigger>open</SheetTrigger>
      <SheetContent>
        <Sidebar inSheet />
      </SheetContent>
    </Sheet>
  )
  fireEvent.click(screen.getByTestId("sheet-trigger"))
  return result
}

describe("Sidebar — inSheet mode", () => {
  it.each([
    { name: "Dashboard", matcher: /dashboard/i, admin: false },
    { name: "Settings", matcher: /settings/i, admin: false },
    { name: "Admin", matcher: /admin/i, admin: true },
  ])("tapping $name closes the sheet via SheetClose", ({ matcher, admin }) => {
    if (admin) mockHas.mockImplementation((arg) => arg?.role === ADMIN_ROLE)
    renderSidebarInOpenSheet()

    const link = within(screen.getByTestId("sheet-content")).getByRole("link", { name: matcher })
    fireEvent.click(link)

    expect(screen.queryByTestId("sheet-content")).not.toBeInTheDocument()
  })

  it("admin link is visible when useAuth().has is called with { role: ADMIN_ROLE }", () => {
    mockHas.mockImplementation((arg) => arg?.role === ADMIN_ROLE)
    renderSidebarInOpenSheet()
    expect(
      within(screen.getByTestId("sheet-content")).getByRole("link", { name: /admin/i })
    ).toBeInTheDocument()
    expect(mockHas).toHaveBeenCalledWith({ role: ADMIN_ROLE })
  })

  it("does not render admin link when useAuth().has returns false", () => {
    mockHas.mockReturnValue(false)
    renderSidebarInOpenSheet()
    expect(
      within(screen.getByTestId("sheet-content")).queryByRole("link", { name: /admin/i })
    ).not.toBeInTheDocument()
  })

  it("renders OrganizationSwitcher in inSheet mode", () => {
    renderSidebarInOpenSheet()
    expect(
      within(screen.getByTestId("sheet-content")).getByTestId("org-switcher")
    ).toBeInTheDocument()
  })

  it("active link has active styling (bg-accent) when pathname matches", () => {
    mockUsePathname.mockReturnValue("/library")
    renderSidebarInOpenSheet()
    const libraryLink = within(screen.getByTestId("sheet-content")).getByRole("link", {
      name: /library/i,
    })
    expect(libraryLink.className).toContain("bg-accent")
    expect(libraryLink.className).toContain("text-accent-foreground")
  })

  it("renders badges on Subscriptions/Library when counts are provided in inSheet mode", () => {
    mockUseSidebarCounts.mockReturnValue({
      subscriptionCount: 7,
      savedCount: 42,
      isLoading: false,
    })
    renderSidebarInOpenSheet()
    const sheetContent = screen.getByTestId("sheet-content")
    expect(within(sheetContent).getByRole("link", { name: /subscriptions/i })).toHaveTextContent(
      "7"
    )
    expect(within(sheetContent).getByRole("link", { name: /library/i })).toHaveTextContent("42")
  })
})
