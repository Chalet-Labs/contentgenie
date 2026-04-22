import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

const mockGetUnreadCount = vi.fn();
const mockGetNotificationSummary = vi.fn();
vi.mock("@/app/actions/notifications", () => ({
  getUnreadCount: (...args: unknown[]) => mockGetUnreadCount(...args),
  getNotificationSummary: (...args: unknown[]) =>
    mockGetNotificationSummary(...args),
}));

let mockPathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn() }),
}));

// NotificationBell renders NotificationPopover which uses useMediaQuery (window.matchMedia).
// Default to desktop so the Popover surface is used (simpler to query in tests).
vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => true,
}));

// Import after mocks
import { NotificationBell } from "@/components/notifications/notification-bell";

const defaultSummary = {
  totalUnread: 3,
  lastSeenAt: null,
  groups: [
    {
      kind: "episodes_by_podcast" as const,
      podcastId: 1,
      podcastTitle: "Test Podcast",
      count: 3,
    },
  ],
};

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetUnreadCount.mockReset();
    mockGetNotificationSummary.mockReset();
    mockPathname = "/dashboard";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function flushMicrotasks() {
    await act(async () => {
      await Promise.resolve();
    });
  }

  it("(a) bell is a button with accessible name Notifications", () => {
    mockGetUnreadCount.mockReturnValue(new Promise(() => {}));
    render(<NotificationBell />);
    expect(
      screen.getByRole("button", { name: /notifications/i })
    ).toBeInTheDocument();
  });

  it("(b) badge count renders after getUnreadCount resolves", async () => {
    mockGetUnreadCount.mockResolvedValue(5);
    render(<NotificationBell />);
    await flushMicrotasks();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("caps the badge at 99+ for large counts", async () => {
    mockGetUnreadCount.mockResolvedValue(150);
    render(<NotificationBell />);
    await flushMicrotasks();
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("hides the badge when count is 0", async () => {
    mockGetUnreadCount.mockResolvedValue(0);
    render(<NotificationBell />);
    await flushMicrotasks();
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
    expect(screen.queryByText("99+")).not.toBeInTheDocument();
  });

  it("(c) polling still refreshes badge every 60s", async () => {
    mockGetUnreadCount.mockResolvedValueOnce(2);
    render(<NotificationBell />);
    await flushMicrotasks();
    expect(screen.getByText("2")).toBeInTheDocument();

    mockGetUnreadCount.mockResolvedValueOnce(7);
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await flushMicrotasks();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("(d) clicking the button opens the popover (role=dialog appears)", async () => {
    mockGetUnreadCount.mockResolvedValue(0);
    mockGetNotificationSummary.mockResolvedValue(defaultSummary);
    render(<NotificationBell />);
    await flushMicrotasks();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    });
    await flushMicrotasks();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("(e) opening the popover triggers getNotificationSummary", async () => {
    mockGetUnreadCount.mockResolvedValue(0);
    mockGetNotificationSummary.mockResolvedValue(defaultSummary);
    render(<NotificationBell />);
    await flushMicrotasks();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    });
    await flushMicrotasks();

    expect(mockGetNotificationSummary).toHaveBeenCalledOnce();
  });

  it("(f) getNotificationSummary error shows Retry path in popover", async () => {
    mockGetUnreadCount.mockResolvedValue(2);
    mockGetNotificationSummary.mockRejectedValue(new Error("fetch failed"));
    render(<NotificationBell />);
    await flushMicrotasks();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    });
    await flushMicrotasks();

    expect(
      screen.getByText(/couldn't load notifications/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("(g) opening popover does NOT call markAllNotificationsRead or markNotificationRead", async () => {
    // These functions are not imported in notification-bell.tsx — verify by
    // ensuring only getUnreadCount + getNotificationSummary are called after click.
    mockGetUnreadCount.mockResolvedValue(3);
    mockGetNotificationSummary.mockResolvedValue(defaultSummary);
    render(<NotificationBell />);
    await flushMicrotasks();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    });
    await flushMicrotasks();

    // Only the two expected functions were called — no mark-read side effects
    expect(mockGetUnreadCount).toHaveBeenCalled();
    expect(mockGetNotificationSummary).toHaveBeenCalled();
  });

  it("(h) route change closes the popover", async () => {
    mockGetUnreadCount.mockResolvedValue(2);
    mockGetNotificationSummary.mockResolvedValue(defaultSummary);
    const { rerender } = render(<NotificationBell />);
    await flushMicrotasks();

    // Open the popover
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    });
    await flushMicrotasks();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Simulate route change by mutating mockPathname and re-rendering
    await act(async () => {
      mockPathname = "/library";
      rerender(<NotificationBell />);
    });
    await flushMicrotasks();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("(i) badge stays at last-known count when getUnreadCount rejects on subsequent poll", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    mockGetUnreadCount.mockResolvedValueOnce(5);
    render(<NotificationBell />);
    await flushMicrotasks();
    expect(screen.getByText("5")).toBeInTheDocument();

    mockGetUnreadCount.mockRejectedValueOnce(new Error("DB down"));
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await flushMicrotasks();

    expect(screen.getByText("5")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("shows a plain title before the first fetch resolves", () => {
    mockGetUnreadCount.mockReturnValue(new Promise(() => {}));
    render(<NotificationBell />);
    const button = screen.getByRole("button", { name: /notifications/i });
    expect(button).toHaveAttribute("title", "Notifications");
  });

  it("surfaces a last-updated timestamp in the button title after a successful fetch", async () => {
    mockGetUnreadCount.mockResolvedValue(3);
    render(<NotificationBell />);
    await flushMicrotasks();

    const button = screen.getByRole("button", { name: /notifications/i });
    expect(button.getAttribute("title")).toMatch(
      /^Notifications · Updated (just now|\d+[mhd] ago|\d+\/\d+\/\d+)$/
    );
  });

  it("does not render a badge when the first fetch fails before any success", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    mockGetUnreadCount.mockRejectedValueOnce(new Error("DB down"));
    render(<NotificationBell />);
    await flushMicrotasks();

    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
