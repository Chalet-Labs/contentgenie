import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"
import React from "react"
import { LibrarySidebar } from "@/components/library/library-sidebar"

vi.mock("next/navigation", () => ({
  usePathname: () => "/library",
}))

const mockGetUserCollections = vi.fn()
vi.mock("@/app/actions/collections", () => ({
  getUserCollections: () => mockGetUserCollections(),
}))

vi.mock("@/components/library/collection-dialog", () => ({
  CollectionDialog: () => null,
}))

// Stateful Sheet mock mirroring the header test pattern. SheetClose honors
// asChild via cloneElement so a regression dropping asChild would fail the
// suite.
vi.mock("@/components/ui/sheet", () => {
  const { useState, createContext, useContext } = require("react") as typeof React

  const SheetStateContext = createContext<{
    open: boolean
    setOpen: (v: boolean) => void
  }>({ open: false, setOpen: () => {} })

  const Sheet = ({ children }: { children: React.ReactNode }) => {
    const [open, setOpen] = useState(false)
    return (
      <SheetStateContext.Provider value={{ open, setOpen }}>
        {children}
      </SheetStateContext.Provider>
    )
  }

  const SheetTrigger = ({ children }: { children: React.ReactNode; asChild?: boolean }) => {
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
    asChild,
  }: {
    children: React.ReactNode
    asChild?: boolean
  }) => {
    const { setOpen } = useContext(SheetStateContext)
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

  return { Sheet, SheetTrigger, SheetContent, SheetClose }
})

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    ...rest
  }: {
    children: React.ReactNode
    onClick?: () => void
    [key: string]: unknown
  }) => (
    <button onClick={onClick} {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  ),
}))

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

describe("LibrarySidebar mobile sheet — closes on link tap", () => {
  beforeEach(() => {
    mockGetUserCollections.mockResolvedValue({
      collections: [
        {
          id: "col-1",
          userId: "user-1",
          name: "Fake Collection",
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          episodeCount: 3,
        },
      ],
      error: null,
    })
  })

  it("closes the sheet when 'All Saved' is tapped", async () => {
    render(<LibrarySidebar />)

    fireEvent.click(screen.getByRole("button", { name: /collections/i }))

    const sheetContent = screen.getByTestId("sheet-content")
    await within(sheetContent).findByRole("link", { name: /fake collection/i })

    const allSavedLink = within(sheetContent).getByRole("link", { name: /all saved/i })
    fireEvent.click(allSavedLink)

    expect(screen.queryByTestId("sheet-content")).not.toBeInTheDocument()
  })

  it("closes the sheet when a collection row is tapped", async () => {
    render(<LibrarySidebar />)

    fireEvent.click(screen.getByRole("button", { name: /collections/i }))

    const sheetContent = screen.getByTestId("sheet-content")
    const collectionLink = await within(sheetContent).findByRole("link", {
      name: /fake collection/i,
    })
    fireEvent.click(collectionLink)

    expect(screen.queryByTestId("sheet-content")).not.toBeInTheDocument()
  })

  it("does NOT close the sheet when the '+' new-collection button is tapped", async () => {
    render(<LibrarySidebar />)

    fireEvent.click(screen.getByRole("button", { name: /collections/i }))

    const sheetContent = screen.getByTestId("sheet-content")
    await within(sheetContent).findByRole("link", { name: /fake collection/i })

    fireEvent.click(
      within(sheetContent).getByRole("button", { name: /new collection/i })
    )

    expect(screen.getByTestId("sheet-content")).toBeInTheDocument()
  })
})

describe("LibrarySidebar desktop aside", () => {
  beforeEach(() => {
    mockGetUserCollections.mockResolvedValue({
      collections: [
        {
          id: "col-1",
          userId: "user-1",
          name: "Fake Collection",
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          episodeCount: 3,
        },
      ],
      error: null,
    })
  })

  // The desktop aside renders SidebarNav with inSheet={false}, so no SheetClose
  // wrapping. This guards against a regression that unconditionally wraps links
  // with SheetClose — which would crash the /library prerender at build time
  // (SheetClose throws outside a Radix Dialog context).
  it("renders links with correct hrefs and clicking does not throw", async () => {
    render(<LibrarySidebar />)

    // Sheet starts closed, so the only mounted nav is the desktop aside.
    const allSaved = await screen.findByRole("link", { name: /all saved/i })
    expect(allSaved).toHaveAttribute("href", "/library")

    const collection = screen.getByRole("link", { name: /fake collection/i })
    expect(collection).toHaveAttribute("href", "/library/collection/col-1")

    expect(() => fireEvent.click(allSaved)).not.toThrow()
    expect(() => fireEvent.click(collection)).not.toThrow()
  })
})

describe("LibrarySidebar error state", () => {
  it("surfaces loadCollections error instead of rendering the empty state", async () => {
    mockGetUserCollections.mockResolvedValue({
      collections: [],
      error: "Failed to load collections",
    })

    render(<LibrarySidebar />)

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(/failed to load collections/i)
    expect(screen.queryByText(/no collections yet/i)).not.toBeInTheDocument()
  })
})
