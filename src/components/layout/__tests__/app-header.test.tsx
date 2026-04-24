import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { AppHeader } from "@/components/layout/app-header";
import { installLocalStorageMock } from "@/test/mocks/local-storage";
import React from "react";

const mockUsePathname = vi.fn(() => "/dashboard");
const mockCounts = { subscriptionCount: 0, savedCount: 0, isLoading: false };

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock("@/contexts/sidebar-counts-context", () => ({
  useSidebarCounts: () => mockCounts,
  useSidebarCountsOptional: () => mockCounts,
  getBadgeCount: (
    href: string,
    counts: {
      subscriptionCount: number;
      savedCount: number;
      isLoading: boolean;
    },
  ): number | null => {
    if (counts.isLoading) return null;
    if (href === "/subscriptions" && counts.subscriptionCount > 0)
      return counts.subscriptionCount;
    if (href === "/library" && counts.savedCount > 0) return counts.savedCount;
    return null;
  },
  NavBadge: ({ count }: { count: number }) => (
    <span>{count > 99 ? "99+" : count}</span>
  ),
}));

vi.mock("@clerk/nextjs", () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  UserButton: () => <div data-testid="user-button" />,
  OrganizationSwitcher: () => <div data-testid="org-switcher" />,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: vi.fn() }),
}));

vi.mock("@/components/notifications/notification-bell", () => ({
  NotificationBell: () => null,
}));

vi.mock("@/contexts/pinned-subscriptions-context", () => ({
  usePinnedSubscriptionsOptional: () => ({
    pinned: [],
    isLoading: false,
    refreshPins: vi.fn(),
  }),
}));

vi.mock("@/components/layout/pinned-subscriptions-section", () => ({
  PinnedSubscriptionsSection: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...rest
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <button {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/separator", () => ({
  Separator: () => <hr />,
}));

vi.mock("@/components/ui/sheet", async () => {
  const { createSheetMock } =
    await vi.importActual<typeof import("@/test/mocks/sheet")>(
      "@/test/mocks/sheet",
    );
  return createSheetMock({ includeSheetTitle: true });
});

beforeEach(() => {
  installLocalStorageMock();
  mockUsePathname.mockReturnValue("/dashboard");
  mockCounts.subscriptionCount = 0;
  mockCounts.savedCount = 0;
  mockCounts.isLoading = false;
});

const renderAndOpenSheet = ({
  isAdmin = false,
}: { isAdmin?: boolean } = {}) => {
  const result = render(<AppHeader isAdmin={isAdmin} />);
  fireEvent.click(screen.getByTestId("sheet-trigger"));
  return result;
};

const getSheetContent = () => screen.getByTestId("sheet-content");

describe("AppHeader — hamburger accessible label", () => {
  it("hamburger button has accessible label 'Open navigation menu'", () => {
    render(<AppHeader isAdmin={false} />);
    expect(
      screen.getByRole("button", { name: /open navigation menu/i }),
    ).toBeInTheDocument();
  });
});

describe("AppHeader — mobile sheet (real Sidebar integration)", () => {
  it("hamburger SheetTrigger is present and opens the sheet", () => {
    render(<AppHeader isAdmin={false} />);
    const trigger = screen.getByTestId("sheet-trigger");
    expect(trigger).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByTestId("sheet-content")).toBeInTheDocument();
  });

  it("sheet content renders the real Sidebar nav links", () => {
    renderAndOpenSheet();

    const sheetContent = getSheetContent();
    expect(
      within(sheetContent).getByRole("link", { name: /dashboard/i }),
    ).toBeInTheDocument();
    expect(
      within(sheetContent).getByRole("link", { name: /discover/i }),
    ).toBeInTheDocument();
    expect(
      within(sheetContent).getByRole("link", { name: /subscriptions/i }),
    ).toBeInTheDocument();
    expect(
      within(sheetContent).getByRole("link", { name: /library/i }),
    ).toBeInTheDocument();
    expect(
      within(sheetContent).getByRole("link", { name: /settings/i }),
    ).toBeInTheDocument();
  });

  it("sheet content renders the OrganizationSwitcher from Sidebar", () => {
    renderAndOpenSheet();
    expect(
      within(getSheetContent()).getByTestId("org-switcher"),
    ).toBeInTheDocument();
  });

  it.each([
    { name: "Dashboard", matcher: /dashboard/i, admin: false },
    { name: "Settings", matcher: /settings/i, admin: false },
    { name: "Admin", matcher: /admin/i, admin: true },
  ])("tapping $name closes the sheet via SheetClose", ({ matcher, admin }) => {
    renderAndOpenSheet({ isAdmin: admin });

    const link = within(getSheetContent()).getByRole("link", { name: matcher });
    fireEvent.click(link);

    expect(screen.queryByTestId("sheet-content")).not.toBeInTheDocument();
  });

  it("admin link is visible inside the sheet when isAdmin is true", () => {
    renderAndOpenSheet({ isAdmin: true });
    expect(
      within(getSheetContent()).getByRole("link", { name: /admin/i }),
    ).toBeInTheDocument();
  });

  it("admin link is NOT visible when isAdmin is false", () => {
    renderAndOpenSheet({ isAdmin: false });
    expect(
      within(getSheetContent()).queryByRole("link", { name: /admin/i }),
    ).not.toBeInTheDocument();
  });

  it("active Dashboard link has active styling when pathname matches", () => {
    renderAndOpenSheet();

    const dashboardLink = within(getSheetContent()).getByRole("link", {
      name: /dashboard/i,
    });
    expect(dashboardLink.className).toContain("bg-accent");
    expect(dashboardLink.className).toContain("text-accent-foreground");
  });

  it("renders badges on Subscriptions/Library in sheet when counts are provided", () => {
    mockCounts.subscriptionCount = 5;
    mockCounts.savedCount = 12;

    renderAndOpenSheet();

    const sheetContent = getSheetContent();
    expect(
      within(sheetContent).getByRole("link", { name: /subscriptions/i }),
    ).toHaveTextContent("5");
    expect(
      within(sheetContent).getByRole("link", { name: /library/i }),
    ).toHaveTextContent("12");
  });
});

describe("AppHeader — utility bar (no inline nav links)", () => {
  it("does not render nav links outside the (closed) sheet", () => {
    render(<AppHeader isAdmin={false} />);
    expect(
      screen.queryByRole("link", { name: /dashboard/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /discover/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /subscriptions/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /library/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /settings/i }),
    ).not.toBeInTheDocument();
  });

  it("header element is present", () => {
    const { container } = render(<AppHeader isAdmin={false} />);
    expect(container.querySelector("header")).toBeInTheDocument();
  });
});
