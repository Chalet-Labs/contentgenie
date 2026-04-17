import type React from "react"

// Factory for mocking @/components/ui/sheet in Vitest suites. Returns a stateful
// drop-in replacement with a throw-guard so any primitive rendered outside a
// <Sheet> provider fails fast — this mirrors real Radix behaviour and catches
// regressions where `inSheet` is accidentally true on the desktop path.
//
// Usage (inside a test file):
//   vi.mock("@/components/ui/sheet", () => {
//     const { createSheetMock } = require("@/test/mocks/sheet")
//     return createSheetMock()
//   })
//
// Pass { includeSheetTitle: true } for suites that render AppHeader's sheet,
// which uses <SheetTitle className="sr-only"> for Radix a11y compliance.
export function createSheetMock(options: { includeSheetTitle?: boolean } = {}) {
  // require("react") is intentional — Vitest hoists vi.mock factories above
  // top-level imports, so the file's React binding isn't available when this
  // runs. Do not convert to an `import` at the call site.
  const React = require("react") as typeof import("react")
  const { useState, createContext, useContext } = React

  const SheetStateContext = createContext<{
    open: boolean
    setOpen: (v: boolean) => void
  } | null>(null)

  const useSheetContext = () => {
    const ctx = useContext(SheetStateContext)
    if (ctx === null) {
      throw new Error("Sheet primitive used outside <Sheet> provider")
    }
    return ctx
  }

  const Sheet = ({ children }: { children: React.ReactNode }) => {
    const [open, setOpen] = useState(false)
    return (
      <SheetStateContext.Provider value={{ open, setOpen }}>
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
    const { setOpen } = useSheetContext()
    return (
      <div data-testid="sheet-trigger" onClick={() => setOpen(true)}>
        {children}
      </div>
    )
  }

  const SheetContent = ({ children }: { children: React.ReactNode }) => {
    const { open } = useSheetContext()
    return open ? <div data-testid="sheet-content">{children}</div> : null
  }

  const SheetClose = ({
    children,
    asChild,
  }: {
    children: React.ReactNode
    asChild?: boolean
  }) => {
    const { setOpen } = useSheetContext()
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

  const mocks: Record<string, unknown> = { Sheet, SheetTrigger, SheetContent, SheetClose }

  if (options.includeSheetTitle) {
    const SheetTitle = ({ children }: { children: React.ReactNode }) => (
      <div data-testid="sheet-title">{children}</div>
    )
    mocks.SheetTitle = SheetTitle
  }

  return mocks
}
