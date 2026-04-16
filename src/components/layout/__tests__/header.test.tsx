import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { Header } from "@/components/layout/header"
import React from "react"

const mockUseSidebarCounts = vi.fn()
vi.mock("@/contexts/sidebar-counts-context", () => ({
  useSidebarCountsOptional: () => mockUseSidebarCounts(),
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

// shadcn Sheet — stateful mock so open/close behaviour can be asserted.
// Sheet owns internal useState; SheetTrigger opens it, SheetClose closes it.
// SheetContent renders only when open. This mirrors real Radix Dialog behaviour.
vi.mock("@/components/ui/sheet", () => {
  const { useState, createContext, useContext } = require("react") as typeof React

  const SheetStateContext = createContext<{
    open: boolean
    setOpen: (v: boolean) => void
  }>({ open: true, setOpen: () => {} })

  const Sheet = ({
    children,
    open: controlledOpen,
    onOpenChange,
  }: {
    children: React.ReactNode
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }) => {
    const [internalOpen, setInternalOpen] = useState(false)
    const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen
    const setOpen = (v: boolean) => {
      setInternalOpen(v)
      onOpenChange?.(v)
    }
    return (
      <SheetStateContext.Provider value={{ open: isOpen, setOpen }}>
        {children}
      </SheetStateContext.Provider>
    )
  }

  const SheetTrigger = ({
    children,
  }: {
    children: React.ReactNode
    asChild?: boolean
  }) => {
    const { setOpen } = useContext(SheetStateContext)
    return (
      <div data-testid="sheet-trigger" onClick={() => setOpen(true)}>
        {children}
      </div>
    )
  }

  const SheetContent = ({ children }: { children: React.ReactNode }) => {
    const { open } = useContext(SheetStateContext)
    return open ? <div data-testid="sheet-content">{children}</div> : null
  }

  const SheetClose = ({
    children,
  }: {
    children: React.ReactNode
    asChild?: boolean
  }) => {
    const { setOpen } = useContext(SheetStateContext)
    return (
      <div data-testid="sheet-close" onClick={() => setOpen(false)}>
        {children}
      </div>
    )
  }

  return { Sheet, SheetTrigger, SheetContent, SheetClose }
})

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

describe("Header mobile menu — sheet closes on nav tap (regression #276)", () => {
  beforeEach(() => {
    mockUseSidebarCounts.mockReturnValue({
      subscriptionCount: 0,
      savedCount: 0,
      isLoading: false,
    })
  })

  it("closes the sheet when a nav link inside the mobile menu is tapped", () => {
    render(<Header />)

    // Open the sheet by clicking the hamburger trigger
    const trigger = screen.getByTestId("sheet-trigger")
    fireEvent.click(trigger)

    // Sheet should now be open and show nav content
    const sheetContent = screen.getByTestId("sheet-content")
    expect(sheetContent).toBeInTheDocument()

    // Click a nav link inside the sheet (scope to avoid matching the desktop nav)
    const dashboardLink = sheetContent.querySelector("a[href='/dashboard']")!
    fireEvent.click(dashboardLink)

    // The sheet must close — sheet-content should no longer be in the DOM
    expect(screen.queryByTestId("sheet-content")).not.toBeInTheDocument()
  })
})

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
    fireEvent.click(screen.getByTestId("sheet-trigger"))

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
    fireEvent.click(screen.getByTestId("sheet-trigger"))

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
    fireEvent.click(screen.getByTestId("sheet-trigger"))

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

  it("does not show badge while loading", () => {
    mockUseSidebarCounts.mockReturnValue({
      subscriptionCount: 10,
      savedCount: 20,
      isLoading: true,
    })

    render(<Header />)
    fireEvent.click(screen.getByTestId("sheet-trigger"))

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
