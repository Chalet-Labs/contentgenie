import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

const mockRemoveAlias = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/topics", () => ({
  removeAlias: (...args: unknown[]) => mockRemoveAlias(...args),
}));

const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: mockToast }));

// Flat AlertDialog mock — renders all children always visible.
// AlertDialogAction gets data-testid so tests can unambiguously target it
// (the trigger button and action both say "Remove", so we need distinction).
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AlertDialogTrigger: ({
    children,
    asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => (asChild ? <>{children}</> : <span>{children}</span>),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button data-testid="alert-dialog-action" onClick={onClick}>
      {children}
    </button>
  ),
}));

import { AliasesPanel } from "@/components/admin/topics/aliases-panel";

const ALIASES = [
  { id: 1, alias: "ts5" },
  { id: 2, alias: "typescript five" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AliasesPanel", () => {
  it("renders alias list", () => {
    render(<AliasesPanel canonicalId={42} aliases={ALIASES} />);
    expect(screen.getByText("ts5")).toBeInTheDocument();
    expect(screen.getByText("typescript five")).toBeInTheDocument();
  });

  it("shows empty state when no aliases", () => {
    render(<AliasesPanel canonicalId={42} aliases={[]} />);
    expect(screen.getByText(/no aliases/i)).toBeInTheDocument();
  });

  it("clicking the AlertDialog confirm action calls removeAlias", async () => {
    mockRemoveAlias.mockResolvedValue({ success: true, data: { removed: 1 } });
    render(
      <AliasesPanel canonicalId={42} aliases={[{ id: 1, alias: "ts5" }]} />,
    );

    // The AlertDialogAction renders with data-testid="alert-dialog-action"
    const confirmBtn = screen.getByTestId("alert-dialog-action");
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(mockRemoveAlias).toHaveBeenCalledWith({
      canonicalId: 42,
      aliasId: 1,
    });
    expect(mockToast.success).toHaveBeenCalledWith("Alias removed.");
  });

  it("shows error toast on remove failure", async () => {
    mockRemoveAlias.mockResolvedValue({ success: false, error: "not-found" });
    render(
      <AliasesPanel canonicalId={42} aliases={[{ id: 3, alias: "foo" }]} />,
    );

    const confirmBtn = screen.getByTestId("alert-dialog-action");
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(mockToast.error).toHaveBeenCalledWith(
      expect.stringContaining("not-found"),
    );
  });
});
