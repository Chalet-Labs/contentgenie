import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"
import { AppHeader } from "@/components/layout/app-header"
import React, { createContext, useState, useContext } from "react"
import { ADMIN_ROLE } from "@/lib/auth-roles"

const mockHas = vi.fn()
const mockUsePathname = vi.fn(() => "/dashboard")
const mockCounts = { subscriptionCount: 0, savedCount: 0, isLoading: false }

// Leaf-level mocks only — real Sidebar renders through these so the integration
// (AppHeader → Sheet → Sidebar → SheetClose → setOpen) is exercised end-to-end.
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}))

vi.mock("@/contexts/sidebar-counts-context", () => ({
  useSidebarCounts: () => mockCounts,
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
  UserButton: () => <div data-testid="user-button" />,
  OrganizationSwitcher: () => <div data-testid="org-switcher" />,
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "test-user-id",
    has: mockHas,
  }),
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: vi.fn() }),
}))

vi.mock("@/components/notifications/notification-bell", () => ({
  NotificationBell: () => null,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...rest
  }: {
    children: React.ReactNode
    [key: string]: unknown
  }) => (
    <button {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  ),
}))

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick?: () => void
  }) => <div onClick={onClick}>{children}</div>,
}))

vi.mock("@/components/ui/separator", () => ({
  Separator: () => <hr />,
}))

// Stateful Sheet mock — mirrors header.test.tsx pattern.
// SheetClose wraps children via cloneElement so the REAL Sidebar's SheetClose
// wrappers actually trigger setOpen(false) when a link is clicked.
type SheetState = { open: boolean; setOpen: (v: boolean) => void }
const SheetStateContext = createContext<SheetState>({ open: false, setOpen: () => {} })

vi.mock("@/components/ui/sheet", () => {
  const getCtx = () =>
    (globalThis as { __SheetStateContext?: typeof SheetStateContext }).__SheetStateContext!

  const Sheet = ({ children }: { children: React.ReactNode }) => {
    const Ctx = getCtx()
    const [open, setOpen] = useState(false)
    return (
      <Ctx.Provider value={{ open, setOpen }}>
        {children}
      </Ctx.Provider>
    )
  }

  const SheetTrigger = ({ children }: { children: React.ReactNode; asChild?: boolean }) => {
    const { setOpen } = useContext(getCtx())
    return (
      <div data-testid="sheet-trigger" onClick={() => setOpen(true)}>
        {children}
      </div>
    )
  }

  const SheetContent = ({ children }: { children: React.ReactNode }) => {
    const { open } = useContext(getCtx())
    return open ? <div data-testid="sheet-content">{children}</div> : null
  }

  const SheetClose = ({
    children,
    asChild,
  }: {
    children: React.ReactNode
    asChild?: boolean
  }) => {
    const { setOpen } = useContext(getCtx())
    const close = () => setOpen(false)
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ onClick?: (e: unknown) => void }>
      return React.cloneElement(child, {
        onClick: (e: unknown) => {
          child.props.onClick?.(e)
          close()
        },
      })
    }
    return (
      <div data-testid="sheet-close" onClick={close}>
        {children}
      </div>
    )
  }

  const SheetTitle = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sheet-title">{children}</div>
  )

  return { Sheet, SheetTrigger, SheetContent, SheetClose, SheetTitle }
})

// Register context on globalThis so the Sheet mock can access it from its factory.
;(globalThis as { __SheetStateContext?: typeof SheetStateContext }).__SheetStateContext =
  SheetStateContext

describe("AppHeader — hamburger accessible label", () => {
  beforeEach(() => {
    mockHas.mockReturnValue(false)
    mockUsePathname.mockReturnValue("/dashboard")
  })

  it("hamburger button has accessible label 'Open navigation menu'", () => {
    render(<AppHeader />)
    expect(
      screen.getByRole("button", { name: /open navigation menu/i })
    ).toBeInTheDocument()
  })
})

describe("AppHeader — mobile sheet (real Sidebar integration)", () => {
  beforeEach(() => {
    mockHas.mockReturnValue(false)
    mockUsePathname.mockReturnValue("/dashboard")
  })

  it("hamburger SheetTrigger is present and opens the sheet", () => {
    render(<AppHeader />)
    const trigger = screen.getByTestId("sheet-trigger")
    expect(trigger).toBeInTheDocument()

    fireEvent.click(trigger)
    expect(screen.getByTestId("sheet-content")).toBeInTheDocument()
  })

  it("sheet content renders the real Sidebar nav links", () => {
    render(<AppHeader />)
    fireEvent.click(screen.getByTestId("sheet-trigger"))

    const sheetContent = screen.getByTestId("sheet-content")
    expect(within(sheetContent).getByRole("link", { name: /dashboard/i })).toBeInTheDocument()
    expect(within(sheetContent).getByRole("link", { name: /discover/i })).toBeInTheDocument()
    expect(within(sheetContent).getByRole("link", { name: /subscriptions/i })).toBeInTheDocument()
    expect(within(sheetContent).getByRole("link", { name: /library/i })).toBeInTheDocument()
    expect(within(sheetContent).getByRole("link", { name: /settings/i })).toBeInTheDocument()
  })

  it("sheet content renders the OrganizationSwitcher from Sidebar", () => {
    render(<AppHeader />)
    fireEvent.click(screen.getByTestId("sheet-trigger"))

    const sheetContent = screen.getByTestId("sheet-content")
    expect(within(sheetContent).getByTestId("org-switcher")).toBeInTheDocument()
  })

  it("tapping Dashboard closes the sheet via SheetClose (regression #276)", () => {
    render(<AppHeader />)
    fireEvent.click(screen.getByTestId("sheet-trigger"))

    const sheetContent = screen.getByTestId("sheet-content")
    const dashboardLink = within(sheetContent).getByRole("link", { name: /dashboard/i })
    fireEvent.click(dashboardLink)

    expect(screen.queryByTestId("sheet-content")).not.toBeInTheDocument()
  })

  it("tapping Settings closes the sheet via SheetClose", () => {
    render(<AppHeader />)
    fireEvent.click(screen.getByTestId("sheet-trigger"))

    const sheetContent = screen.getByTestId("sheet-content")
    const settingsLink = within(sheetContent).getByRole("link", { name: /settings/i })
    fireEvent.click(settingsLink)

    expect(screen.queryByTestId("sheet-content")).not.toBeInTheDocument()
  })

  it("admin link is visible inside the sheet when useAuth().has returns true for ADMIN_ROLE", () => {
    mockHas.mockImplementation((arg) => arg?.role === ADMIN_ROLE)
    render(<AppHeader />)
    fireEvent.click(screen.getByTestId("sheet-trigger"))

    const sheetContent = screen.getByTestId("sheet-content")
    expect(within(sheetContent).getByRole("link", { name: /admin/i })).toBeInTheDocument()
    expect(mockHas).toHaveBeenCalledWith({ role: ADMIN_ROLE })
  })

  it("tapping admin link closes the sheet via SheetClose", () => {
    mockHas.mockImplementation((arg) => arg?.role === ADMIN_ROLE)
    render(<AppHeader />)
    fireEvent.click(screen.getByTestId("sheet-trigger"))

    const sheetContent = screen.getByTestId("sheet-content")
    const adminLink = within(sheetContent).getByRole("link", { name: /admin/i })
    fireEvent.click(adminLink)

    expect(screen.queryByTestId("sheet-content")).not.toBeInTheDocument()
  })

  it("admin link is NOT visible when useAuth().has returns false", () => {
    mockHas.mockReturnValue(false)
    render(<AppHeader />)
    fireEvent.click(screen.getByTestId("sheet-trigger"))

    const sheetContent = screen.getByTestId("sheet-content")
    expect(within(sheetContent).queryByRole("link", { name: /admin/i })).not.toBeInTheDocument()
  })

  it("active Dashboard link has active styling when pathname matches", () => {
    mockUsePathname.mockReturnValue("/dashboard")
    render(<AppHeader />)
    fireEvent.click(screen.getByTestId("sheet-trigger"))

    const sheetContent = screen.getByTestId("sheet-content")
    const dashboardLink = within(sheetContent).getByRole("link", { name: /dashboard/i })
    expect(dashboardLink.className).toContain("bg-accent")
    expect(dashboardLink.className).toContain("text-accent-foreground")
  })

  it("renders badges on Subscriptions/Library in sheet when counts are provided", () => {
    mockCounts.subscriptionCount = 5
    mockCounts.savedCount = 12
    try {
      render(<AppHeader />)
      fireEvent.click(screen.getByTestId("sheet-trigger"))

      const sheetContent = screen.getByTestId("sheet-content")
      const subscriptionsLink = within(sheetContent).getByRole("link", { name: /subscriptions/i })
      const libraryLink = within(sheetContent).getByRole("link", { name: /library/i })
      expect(subscriptionsLink).toHaveTextContent("5")
      expect(libraryLink).toHaveTextContent("12")
    } finally {
      mockCounts.subscriptionCount = 0
      mockCounts.savedCount = 0
    }
  })
})

describe("AppHeader — utility bar (no inline nav links)", () => {
  beforeEach(() => {
    mockHas.mockReturnValue(false)
    mockUsePathname.mockReturnValue("/dashboard")
  })

  it("does not render nav links outside the (closed) sheet", () => {
    render(<AppHeader />)
    // Sheet is closed — Sidebar content not rendered at all
    expect(screen.queryByRole("link", { name: /dashboard/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /discover/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /subscriptions/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /library/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /settings/i })).not.toBeInTheDocument()
  })

  it("header element is present", () => {
    const { container } = render(<AppHeader />)
    expect(container.querySelector("header")).toBeInTheDocument()
  })
})
