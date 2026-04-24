import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import {
  PINNED_EXPANDED_STORAGE_KEY,
  PINNED_EXPANDED_STORAGE_VALUE,
  Sidebar,
} from "@/components/layout/sidebar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { installLocalStorageMock } from "@/test/mocks/local-storage";

const mockUseSidebarCounts = vi.fn();
const mockUsePinnedSubscriptionsOptional = vi.fn();
const mockUsePathname = vi.fn(() => "/");

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock("@/contexts/sidebar-counts-context", () => ({
  useSidebarCounts: () => mockUseSidebarCounts(),
  useSidebarCountsOptional: () => mockUseSidebarCounts(),
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
  OrganizationSwitcher: () => <div data-testid="org-switcher" />,
}));

vi.mock("@/contexts/pinned-subscriptions-context", () => ({
  usePinnedSubscriptionsOptional: () => mockUsePinnedSubscriptionsOptional(),
}));

vi.mock("@/components/layout/pinned-subscriptions-section", () => ({
  PinnedSubscriptionsSection: ({ inSheet }: { inSheet: boolean }) => (
    <div data-testid="pinned-section" data-in-sheet={inSheet}>
      pinned section
    </div>
  ),
}));

vi.mock("@/components/ui/sheet", async () => {
  const { createSheetMock } =
    await vi.importActual<typeof import("@/test/mocks/sheet")>(
      "@/test/mocks/sheet",
    );
  return createSheetMock();
});

beforeEach(() => {
  installLocalStorageMock();
  mockUseSidebarCounts.mockReturnValue({
    subscriptionCount: 0,
    savedCount: 0,
    isLoading: false,
  });
  mockUsePinnedSubscriptionsOptional.mockReturnValue({
    pinned: [],
    isLoading: false,
    refreshPins: vi.fn(),
  });
  mockUsePathname.mockReturnValue("/");
});

describe("Sidebar — inline aside mode", () => {
  it("shows badge on Subscriptions link when subscriptionCount > 0", () => {
    mockUseSidebarCounts.mockReturnValue({
      subscriptionCount: 5,
      savedCount: 0,
      isLoading: false,
    });

    render(<Sidebar isAdmin={false} />);

    const subscriptionsLink = screen.getByRole("link", {
      name: /subscriptions/i,
    });
    expect(subscriptionsLink).toHaveTextContent("5");
  });

  it("shows badge on Library link when savedCount > 0", () => {
    mockUseSidebarCounts.mockReturnValue({
      subscriptionCount: 0,
      savedCount: 12,
      isLoading: false,
    });

    render(<Sidebar isAdmin={false} />);

    const libraryLink = screen.getByRole("link", { name: /library/i });
    expect(libraryLink).toHaveTextContent("12");
  });

  it("does not show badge when counts are 0", () => {
    render(<Sidebar isAdmin={false} />);

    const subscriptionsLink = screen.getByRole("link", {
      name: /subscriptions/i,
    });
    const libraryLink = screen.getByRole("link", { name: /library/i });

    expect(subscriptionsLink.querySelector("span")).toBeNull();
    expect(libraryLink.querySelector("span")).toBeNull();
  });

  it("does not show badge while loading", () => {
    mockUseSidebarCounts.mockReturnValue({
      subscriptionCount: 10,
      savedCount: 20,
      isLoading: true,
    });

    render(<Sidebar isAdmin={false} />);

    const subscriptionsLink = screen.getByRole("link", {
      name: /subscriptions/i,
    });
    const libraryLink = screen.getByRole("link", { name: /library/i });

    expect(subscriptionsLink.querySelector("span")).toBeNull();
    expect(libraryLink.querySelector("span")).toBeNull();
  });

  it("shows Admin link when isAdmin is true", () => {
    render(<Sidebar isAdmin={true} />);
    expect(screen.getByRole("link", { name: /admin/i })).toBeInTheDocument();
  });

  it("does not show Admin link when isAdmin is false", () => {
    render(<Sidebar isAdmin={false} />);
    expect(
      screen.queryByRole("link", { name: /admin/i }),
    ).not.toBeInTheDocument();
  });

  it("renders OrganizationSwitcher in inline mode", () => {
    render(<Sidebar isAdmin={false} />);
    expect(screen.getByTestId("org-switcher")).toBeInTheDocument();
  });
});

const renderSidebarInOpenSheet = ({
  isAdmin = false,
}: { isAdmin?: boolean } = {}) => {
  const result = render(
    <Sheet>
      <SheetTrigger>open</SheetTrigger>
      <SheetContent>
        <Sidebar inSheet isAdmin={isAdmin} />
      </SheetContent>
    </Sheet>,
  );
  fireEvent.click(screen.getByTestId("sheet-trigger"));
  return result;
};

describe("Sidebar — inSheet mode", () => {
  it.each([
    { name: "Dashboard", matcher: /dashboard/i, admin: false },
    { name: "Settings", matcher: /settings/i, admin: false },
    { name: "Admin", matcher: /admin/i, admin: true },
  ])("tapping $name closes the sheet via SheetClose", ({ matcher, admin }) => {
    renderSidebarInOpenSheet({ isAdmin: admin });

    const link = within(screen.getByTestId("sheet-content")).getByRole("link", {
      name: matcher,
    });
    fireEvent.click(link);

    expect(screen.queryByTestId("sheet-content")).not.toBeInTheDocument();
  });

  it("admin link is visible when isAdmin is true", () => {
    renderSidebarInOpenSheet({ isAdmin: true });
    expect(
      within(screen.getByTestId("sheet-content")).getByRole("link", {
        name: /admin/i,
      }),
    ).toBeInTheDocument();
  });

  it("does not render admin link when isAdmin is false", () => {
    renderSidebarInOpenSheet({ isAdmin: false });
    expect(
      within(screen.getByTestId("sheet-content")).queryByRole("link", {
        name: /admin/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("renders OrganizationSwitcher in inSheet mode", () => {
    renderSidebarInOpenSheet();
    expect(
      within(screen.getByTestId("sheet-content")).getByTestId("org-switcher"),
    ).toBeInTheDocument();
  });

  it("active link has active styling (bg-accent) when pathname matches", () => {
    mockUsePathname.mockReturnValue("/library");
    renderSidebarInOpenSheet();
    const libraryLink = within(screen.getByTestId("sheet-content")).getByRole(
      "link",
      {
        name: /library/i,
      },
    );
    expect(libraryLink.className).toContain("bg-accent");
    expect(libraryLink.className).toContain("text-accent-foreground");
  });

  it("renders badges on Subscriptions/Library when counts are provided in inSheet mode", () => {
    mockUseSidebarCounts.mockReturnValue({
      subscriptionCount: 7,
      savedCount: 42,
      isLoading: false,
    });
    renderSidebarInOpenSheet();
    const sheetContent = screen.getByTestId("sheet-content");
    expect(
      within(sheetContent).getByRole("link", { name: /subscriptions/i }),
    ).toHaveTextContent("7");
    expect(
      within(sheetContent).getByRole("link", { name: /library/i }),
    ).toHaveTextContent("42");
  });
});

describe("Sidebar — pinned podcasts chevron", () => {
  it("does not render chevron when pinned is empty", () => {
    render(<Sidebar isAdmin={false} />);
    expect(screen.queryByLabelText("Toggle pinned podcasts")).toBeNull();
  });

  it("renders chevron when pinned.length > 0 but section is collapsed by default", () => {
    mockUsePinnedSubscriptionsOptional.mockReturnValue({
      pinned: [
        {
          id: 1,
          podcastId: 10,
          podcastIndexId: "10",
          title: "A",
          imageUrl: null,
        },
        {
          id: 2,
          podcastId: 20,
          podcastIndexId: "20",
          title: "B",
          imageUrl: null,
        },
      ],
      isLoading: false,
      refreshPins: vi.fn(),
    });
    render(<Sidebar isAdmin={false} />);

    expect(screen.getByLabelText("Toggle pinned podcasts")).toBeInTheDocument();
    expect(screen.queryByTestId("pinned-section")).toBeNull();
  });

  it("clicking chevron expands section and sets localStorage", async () => {
    mockUsePinnedSubscriptionsOptional.mockReturnValue({
      pinned: [
        {
          id: 1,
          podcastId: 10,
          podcastIndexId: "10",
          title: "A",
          imageUrl: null,
        },
      ],
      isLoading: false,
      refreshPins: vi.fn(),
    });
    render(<Sidebar isAdmin={false} />);

    const chevron = screen.getByLabelText("Toggle pinned podcasts");
    expect(chevron).toHaveAttribute("aria-expanded", "false");

    await act(async () => {
      fireEvent.click(chevron);
    });

    expect(screen.getByTestId("pinned-section")).toBeInTheDocument();
    expect(localStorage.getItem(PINNED_EXPANDED_STORAGE_KEY)).toBe(
      PINNED_EXPANDED_STORAGE_VALUE,
    );
    expect(chevron).toHaveAttribute("aria-expanded", "true");
  });

  it("does not expand on mount when localStorage value is anything other than '1'", () => {
    localStorage.setItem(PINNED_EXPANDED_STORAGE_KEY, "true");
    mockUsePinnedSubscriptionsOptional.mockReturnValue({
      pinned: [
        {
          id: 1,
          podcastId: 10,
          podcastIndexId: "10",
          title: "A",
          imageUrl: null,
        },
      ],
      isLoading: false,
      refreshPins: vi.fn(),
    });

    render(<Sidebar isAdmin={false} />);

    expect(screen.queryByTestId("pinned-section")).toBeNull();
    expect(screen.getByLabelText("Toggle pinned podcasts")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("clicking chevron twice collapses section and removes localStorage key", async () => {
    mockUsePinnedSubscriptionsOptional.mockReturnValue({
      pinned: [
        {
          id: 1,
          podcastId: 10,
          podcastIndexId: "10",
          title: "A",
          imageUrl: null,
        },
      ],
      isLoading: false,
      refreshPins: vi.fn(),
    });
    render(<Sidebar isAdmin={false} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Toggle pinned podcasts"));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Toggle pinned podcasts"));
    });

    expect(screen.queryByTestId("pinned-section")).toBeNull();
    expect(localStorage.getItem(PINNED_EXPANDED_STORAGE_KEY)).toBeNull();
  });

  it("reads localStorage on mount and expands section when pre-seeded to '1'", async () => {
    localStorage.setItem(
      PINNED_EXPANDED_STORAGE_KEY,
      PINNED_EXPANDED_STORAGE_VALUE,
    );
    mockUsePinnedSubscriptionsOptional.mockReturnValue({
      pinned: [
        {
          id: 1,
          podcastId: 10,
          podcastIndexId: "10",
          title: "A",
          imageUrl: null,
        },
      ],
      isLoading: false,
      refreshPins: vi.fn(),
    });

    render(<Sidebar isAdmin={false} />);

    // Wait for the post-mount effect to fire
    await act(async () => {});

    expect(screen.getByTestId("pinned-section")).toBeInTheDocument();
  });

  it("clicking the Subscriptions link does not trigger the chevron toggle", async () => {
    mockUsePinnedSubscriptionsOptional.mockReturnValue({
      pinned: [
        {
          id: 1,
          podcastId: 10,
          podcastIndexId: "10",
          title: "A",
          imageUrl: null,
        },
      ],
      isLoading: false,
      refreshPins: vi.fn(),
    });
    render(<Sidebar isAdmin={false} />);

    // Click the link — section should stay collapsed
    fireEvent.click(screen.getByRole("link", { name: /subscriptions/i }));

    expect(screen.queryByTestId("pinned-section")).toBeNull();
    expect(localStorage.getItem(PINNED_EXPANDED_STORAGE_KEY)).toBeNull();

    // Chevron is a separate button target
    const chevron = screen.getByLabelText("Toggle pinned podcasts");
    expect(chevron.tagName).toBe("BUTTON");
  });
});
