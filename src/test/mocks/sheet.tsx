import React from "react";

// Factory for mocking @/components/ui/sheet in Vitest suites. Returns a stateful
// drop-in replacement with a throw-guard so any primitive rendered outside a
// <Sheet> provider fails fast — this mirrors real Radix behaviour and catches
// regressions where `inSheet` is accidentally true on the desktop path.
//
// Usage (inside a test file):
//   vi.mock("@/components/ui/sheet", async () => {
//     const { createSheetMock } = await vi.importActual<typeof import("@/test/mocks/sheet")>(
//       "@/test/mocks/sheet"
//     )
//     return createSheetMock()
//   })
//
// Pass { includeSheetTitle: true } for suites that render AppHeader's sheet,
// which uses <SheetTitle className="sr-only"> for Radix a11y compliance.
export function createSheetMock(options: { includeSheetTitle?: boolean } = {}) {
  const { useState, createContext, useContext } = React;

  const SheetStateContext = createContext<{
    open: boolean;
    setOpen: (v: boolean) => void;
  } | null>(null);

  const useSheetContext = () => {
    const ctx = useContext(SheetStateContext);
    if (ctx === null) {
      throw new Error("Sheet primitive used outside <Sheet> provider");
    }
    return ctx;
  };

  const Sheet = ({ children }: { children: React.ReactNode }) => {
    const [open, setOpen] = useState(false);
    return (
      <SheetStateContext.Provider value={{ open, setOpen }}>
        {children}
      </SheetStateContext.Provider>
    );
  };

  const SheetTrigger = ({
    children,
    asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => {
    const { setOpen } = useSheetContext();
    const open = () => setOpen(true);
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{
        onClick?: (e: unknown) => void;
      }>;
      return React.cloneElement(child, {
        "data-testid": "sheet-trigger",
        onClick: (e: unknown) => {
          child.props.onClick?.(e);
          open();
        },
      } as Record<string, unknown>);
    }
    return (
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- Radix Sheet test mock fallback; real DOM uses a proper button via asChild cloneElement above
      <div data-testid="sheet-trigger" onClick={open}>
        {children}
      </div>
    );
  };

  const SheetContent = ({ children }: { children: React.ReactNode }) => {
    const { open } = useSheetContext();
    return open ? <div data-testid="sheet-content">{children}</div> : null;
  };

  const SheetClose = ({
    children,
    asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => {
    const { setOpen } = useSheetContext();
    const close = () => setOpen(false);
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{
        onClick?: (e: unknown) => void;
      }>;
      return React.cloneElement(child, {
        onClick: (e: unknown) => {
          child.props.onClick?.(e);
          close();
        },
      });
    }
    return (
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- Radix SheetClose test mock fallback; real DOM uses a proper button via asChild cloneElement above
      <div data-testid="sheet-close" onClick={close}>
        {children}
      </div>
    );
  };

  const mocks: Record<string, unknown> = {
    Sheet,
    SheetTrigger,
    SheetContent,
    SheetClose,
  };

  if (options.includeSheetTitle) {
    const SheetTitle = ({ children }: { children: React.ReactNode }) => (
      <div data-testid="sheet-title">{children}</div>
    );
    mocks.SheetTitle = SheetTitle;
  }

  return mocks;
}
