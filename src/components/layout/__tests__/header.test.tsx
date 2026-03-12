import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { Header } from "@/components/layout/header"

const mockUseSidebarCounts = vi.fn()
vi.mock("@/contexts/sidebar-counts-context", () => ({
  useSidebarCountsOptional: () => mockUseSidebarCounts(),
}))

vi.mock("@clerk/nextjs", () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  UserButton: () => null,
  OrganizationSwitcher: () => null,
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: vi.fn() }),
}))

vi.mock("@/components/notifications/notification-bell", () => ({
  NotificationBell: () => null,
}))

// shadcn Sheet — render SheetContent inline so mobile nav is visible in tests
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sheet-content">{children}</div>
  ),
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => (
    <button {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}>{children}</button>
  ),
}))

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <div onClick={onClick}>{children}</div>
  ),
}))

vi.mock("@/components/ui/separator", () => ({
  Separator: () => <hr />,
}))

describe("Header mobile menu", () => {
  beforeEach(() => {
    mockUseSidebarCounts.mockReturnValue({
      subscriptionCount: 0,
      savedCount: 0,
      isLoading: false,
    })
  })

  it("shows badge on Subscriptions link when subscriptionCount > 0", () => {
    mockUseSidebarCounts.mockReturnValue({
      subscriptionCount: 8,
      savedCount: 0,
      isLoading: false,
    })

    render(<Header />)

    const sheet = screen.getByTestId("sheet-content")
    const links = sheet.querySelectorAll("a")
    const subscriptionsLink = Array.from(links).find((l) =>
      l.textContent?.includes("Subscriptions")
    )

    expect(subscriptionsLink).toBeDefined()
    expect(subscriptionsLink!.textContent).toContain("8")
  })

  it("shows badge on Library link when savedCount > 0", () => {
    mockUseSidebarCounts.mockReturnValue({
      subscriptionCount: 0,
      savedCount: 4,
      isLoading: false,
    })

    render(<Header />)

    const sheet = screen.getByTestId("sheet-content")
    const links = sheet.querySelectorAll("a")
    const libraryLink = Array.from(links).find((l) =>
      l.textContent?.includes("Library")
    )

    expect(libraryLink).toBeDefined()
    expect(libraryLink!.textContent).toContain("4")
  })

  it("does not show badge when counts are 0", () => {
    mockUseSidebarCounts.mockReturnValue({
      subscriptionCount: 0,
      savedCount: 0,
      isLoading: false,
    })

    render(<Header />)

    const sheet = screen.getByTestId("sheet-content")
    const links = sheet.querySelectorAll("a")

    const subscriptionsLink = Array.from(links).find((l) =>
      l.textContent?.includes("Subscriptions")
    )
    const libraryLink = Array.from(links).find((l) =>
      l.textContent?.includes("Library")
    )

    expect(subscriptionsLink?.querySelector("span")).toBeNull()
    expect(libraryLink?.querySelector("span")).toBeNull()
  })
})
