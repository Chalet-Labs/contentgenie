import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react"
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

// shadcn Sheet — stateful mock mirroring the header test pattern.
// SheetClose with asChild cloneElement behaviour ensures the regression
// test fails if the fix omits asChild.
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
  Button: ({ children, onClick, ...rest }: { children: React.ReactNode; onClick?: () => void; [key: string]: unknown }) => (
    <button onClick={onClick} {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  ),
}))

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}))

describe("LibrarySidebar mobile sheet — closes on link tap (regression #284)", () => {
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

    // Open the mobile sheet via the Collections trigger
    const triggers = screen.getAllByTestId("sheet-trigger")
    fireEvent.click(triggers[0])

    const sheetContent = screen.getByTestId("sheet-content")
    // Await async getUserCollections resolution so the subsequent setState
    // settles inside act before we assert.
    await within(sheetContent).findByRole("link", { name: /fake collection/i })

    const allSavedLink = within(sheetContent).getByRole("link", { name: /all saved/i })
    fireEvent.click(allSavedLink)

    expect(screen.queryByTestId("sheet-content")).not.toBeInTheDocument()
  })

  it("closes the sheet when a collection row is tapped", async () => {
    render(<LibrarySidebar />)

    fireEvent.click(screen.getAllByTestId("sheet-trigger")[0])

    const sheetContent = screen.getByTestId("sheet-content")
    // Collection list loads asynchronously after getUserCollections resolves.
    const collectionLink = await within(sheetContent).findByRole("link", {
      name: /fake collection/i,
    })
    fireEvent.click(collectionLink)

    expect(screen.queryByTestId("sheet-content")).not.toBeInTheDocument()
  })

  it("does NOT close the sheet when the '+' new-collection button is tapped", async () => {
    render(<LibrarySidebar />)

    fireEvent.click(screen.getAllByTestId("sheet-trigger")[0])

    const sheetContent = screen.getByTestId("sheet-content")
    // Wait for collections to load so the '+' button is findable alongside them.
    await within(sheetContent).findByRole("link", { name: /fake collection/i })

    // The '+' button is the only icon-only button inside the sheet (no accessible name
    // beyond the Plus icon). Scope to the sheet and pick the single button that is NOT
    // the SheetTrigger's outer wrapper.
    const buttons = within(sheetContent).getAllByRole("button")
    // The first button inside SheetContent is the "+" create button (Sheet trigger lives outside).
    fireEvent.click(buttons[0])

    // Sheet must remain open: SheetClose was not wrapped around the '+' control.
    await waitFor(() => {
      expect(screen.getByTestId("sheet-content")).toBeInTheDocument()
    })
  })
})
