import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"
import { AppHeader } from "@/components/layout/app-header"
import React, { createContext, useState, useContext } from "react"

const mockUseAuth = vi.fn()

vi.mock("@/contexts/sidebar-counts-context", () => ({
  useSidebarCounts: () => ({ subscriptionCount: 0, savedCount: 0, isLoading: false }),
  useSidebarCountsOptional: () => ({ subscriptionCount: 0, savedCount: 0, isLoading: false }),
  getBadgeCount: () => null,
  NavBadge: ({ count }: { count: number }) => <span>{count}</span>,
}))

vi.mock("@clerk/nextjs", () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  UserButton: () => <div data-testid="user-button" />,
  OrganizationSwitcher: () => null,
  useAuth: () => mockUseAuth(),
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

// --- Shared Sheet state context ---
// Created at module level so both the Sheet mock and the Sidebar mock can access it.
type SheetState = { open: boolean; setOpen: (v: boolean) => void }
const SheetStateContext = createContext<SheetState>({ open: false, setOpen: () => {} })

// Stateful Sheet mock — mirrors header.test.tsx pattern.
vi.mock("@/components/ui/sheet", () => {
  // We import from the test module's outer scope via a factory pattern.
  // The context is defined outside so the Sidebar mock can share it.
  // vi.mock factories can't close over module-level vars directly, so
  // we create a local alias that references the top-level context via
  // a getter attached to globalThis.
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

  const SheetTrigger = ({
    children,
  }: {
    children: React.ReactNode
    asChild?: boolean
  }) => {
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

// Sidebar mock — renders nav links; wraps in SheetClose when inSheet.
// Uses the same SheetStateContext as the Sheet mock via globalThis.
vi.mock("@/components/layout/sidebar", () => {
  const getCtx = () =>
    (globalThis as { __SheetStateContext?: typeof SheetStateContext }).__SheetStateContext!

  const SidebarMock = ({ inSheet }: { inSheet?: boolean }) => {
    const { setOpen } = useContext(getCtx())

    const links = [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/discover", label: "Discover" },
      { href: "/subscriptions", label: "Subscriptions" },
      { href: "/library", label: "Library" },
      { href: "/settings", label: "Settings" },
      ...(inSheet ? [{ href: "/admin", label: "Admin" }] : []),
    ]

    return (
      <div data-testid="sidebar-mock" data-in-sheet={String(Boolean(inSheet))}>
        {links.map(({ href, label }) => (
          <a
            key={href}
            href={href}
            onClick={inSheet ? () => setOpen(false) : undefined}
          >
            {label}
          </a>
        ))}
      </div>
    )
  }
  return { Sidebar: SidebarMock }
})

// Register the context on globalThis before tests run so mocks can access it.
;(globalThis as { __SheetStateContext?: typeof SheetStateContext }).__SheetStateContext =
  SheetStateContext

describe("AppHeader — hamburger accessible label", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ has: () => false })
  })

  it("hamburger button has accessible label 'Open navigation menu'", () => {
    render(<AppHeader />)
    expect(
      screen.getByRole("button", { name: /open navigation menu/i })
    ).toBeInTheDocument()
  })
})

describe("AppHeader — mobile sheet", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ has: () => false })
  })

  it("hamburger SheetTrigger is present and opens the sheet", () => {
    render(<AppHeader />)
    const trigger = screen.getByTestId("sheet-trigger")
    expect(trigger).toBeInTheDocument()

    fireEvent.click(trigger)
    expect(screen.getByTestId("sheet-content")).toBeInTheDocument()
  })

  it("sheet content renders Sidebar with inSheet prop", () => {
    render(<AppHeader />)
    fireEvent.click(screen.getByTestId("sheet-trigger"))

    const sheetContent = screen.getByTestId("sheet-content")
    const sidebar = within(sheetContent).getByTestId("sidebar-mock")
    expect(sidebar).toHaveAttribute("data-in-sheet", "true")
  })

  it("tapping a nav link (Dashboard) inside the sheet closes the sheet", () => {
    render(<AppHeader />)
    fireEvent.click(screen.getByTestId("sheet-trigger"))

    const sheetContent = screen.getByTestId("sheet-content")
    const dashboardLink = within(sheetContent).getByRole("link", { name: /dashboard/i })
    fireEvent.click(dashboardLink)

    expect(screen.queryByTestId("sheet-content")).not.toBeInTheDocument()
  })

  it("tapping the /settings link inside the sheet closes the sheet", () => {
    render(<AppHeader />)
    fireEvent.click(screen.getByTestId("sheet-trigger"))

    const sheetContent = screen.getByTestId("sheet-content")
    const settingsLink = within(sheetContent).getByRole("link", { name: /settings/i })
    fireEvent.click(settingsLink)

    expect(screen.queryByTestId("sheet-content")).not.toBeInTheDocument()
  })

  it("admin link is visible inside the sheet when user has admin role", () => {
    mockUseAuth.mockReturnValue({ has: () => true })
    render(<AppHeader />)
    fireEvent.click(screen.getByTestId("sheet-trigger"))

    const sheetContent = screen.getByTestId("sheet-content")
    expect(within(sheetContent).getByRole("link", { name: /admin/i })).toBeInTheDocument()
  })

  it("tapping the admin link inside the sheet closes the sheet", () => {
    mockUseAuth.mockReturnValue({ has: () => true })
    render(<AppHeader />)
    fireEvent.click(screen.getByTestId("sheet-trigger"))

    const sheetContent = screen.getByTestId("sheet-content")
    const adminLink = within(sheetContent).getByRole("link", { name: /admin/i })
    fireEvent.click(adminLink)

    expect(screen.queryByTestId("sheet-content")).not.toBeInTheDocument()
  })
})

describe("AppHeader — utility bar (no inline nav links)", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ has: () => false })
  })

  it("does not render nav links (Dashboard/Discover/etc.) outside the sheet", () => {
    render(<AppHeader />)
    // Sheet is closed — these links should not be in the DOM at all
    expect(screen.queryByRole("link", { name: /dashboard/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /discover/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /subscriptions/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /library/i })).not.toBeInTheDocument()
  })

  it("header element is present", () => {
    const { container } = render(<AppHeader />)
    expect(container.querySelector("header")).toBeInTheDocument()
  })
})
