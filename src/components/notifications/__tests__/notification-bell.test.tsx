import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

const mockGetUnreadCount = vi.fn();
const mockGetNotificationSummary = vi.fn();
const mockMarkAllNotificationsRead = vi.fn();
vi.mock("@/app/actions/notifications", () => ({
  getUnreadCount: (...args: unknown[]) => mockGetUnreadCount(...args),
  getNotificationSummary: (...args: unknown[]) =>
    mockGetNotificationSummary(...args),
  markAllNotificationsRead: (...args: unknown[]) =>
    mockMarkAllNotificationsRead(...args),
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
    mockMarkAllNotificationsRead.mockReset();
    mockMarkAllNotificationsRead.mockResolvedValue({ success: true });
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
      screen.getByRole("button", { name: /notifications/i }),
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

  it("(f) getNotificationSummary error shows Retry path, logs the error, and does NOT call markAllNotificationsRead", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockGetUnreadCount.mockResolvedValue(2);
    const fetchError = new Error("fetch failed");
    mockGetNotificationSummary.mockRejectedValue(fetchError);
    render(<NotificationBell />);
    await flushMicrotasks();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    });
    await flushMicrotasks();

    expect(
      screen.getByText(/couldn't load notifications/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    // Error must be logged, not swallowed — bare catch {} was a debugging blackhole.
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to fetch notification summary:",
      fetchError,
    );
    // Don't advance the "since last visit" boundary over notifications the
    // user never saw when the summary fetch failed.
    expect(mockMarkAllNotificationsRead).not.toHaveBeenCalled();
    // Badge should stay at the last-known count since we skipped the optimistic reset.
    expect(screen.getByText("2")).toBeInTheDocument();

    consoleError.mockRestore();
  });

  it("(g) opening the popover calls markAllNotificationsRead after fetching the summary", async () => {
    mockGetUnreadCount.mockResolvedValue(3);
    mockGetNotificationSummary.mockResolvedValue(defaultSummary);
    render(<NotificationBell />);
    await flushMicrotasks();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    });
    await flushMicrotasks();

    expect(mockGetNotificationSummary).toHaveBeenCalledOnce();
    expect(mockMarkAllNotificationsRead).toHaveBeenCalledOnce();
    // fetchSummary must be issued before markAllNotificationsRead so the
    // popover renders items that *were* unread (the unread SELECT has to
    // observe the rows before the UPDATE commits).
    const fetchOrder = mockGetNotificationSummary.mock.invocationCallOrder[0];
    const markOrder = mockMarkAllNotificationsRead.mock.invocationCallOrder[0];
    expect(fetchOrder).toBeLessThan(markOrder);
  });

  it("(g2) closing the popover does NOT call markAllNotificationsRead", async () => {
    mockGetUnreadCount.mockResolvedValue(3);
    mockGetNotificationSummary.mockResolvedValue(defaultSummary);
    render(<NotificationBell />);
    await flushMicrotasks();

    // Open
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    });
    await flushMicrotasks();
    mockMarkAllNotificationsRead.mockClear();

    // Close via Escape
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: "Escape",
      });
    });
    await flushMicrotasks();

    expect(mockMarkAllNotificationsRead).not.toHaveBeenCalled();
  });

  it("(g3) badge optimistically drops to 0 when popover opens, reverts and logs on mark-read failure", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockGetUnreadCount.mockResolvedValue(5);
    mockGetNotificationSummary.mockResolvedValue(defaultSummary);
    mockMarkAllNotificationsRead.mockResolvedValue({
      success: false,
      error: "DB down",
    });

    render(<NotificationBell />);
    await flushMicrotasks();
    expect(screen.getByText("5")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    });
    await flushMicrotasks();

    expect(screen.getByText("5")).toBeInTheDocument();
    // Structured failures must surface — a silent revert hides session/DB issues.
    expect(consoleError).toHaveBeenCalledWith(
      "markAllNotificationsRead failed:",
      "DB down",
    );
    consoleError.mockRestore();
  });

  it("(g4) badge drops to 0 and stays there on successful mark-read", async () => {
    mockGetUnreadCount.mockResolvedValue(5);
    mockGetNotificationSummary.mockResolvedValue(defaultSummary);
    mockMarkAllNotificationsRead.mockResolvedValue({ success: true });

    render(<NotificationBell />);
    await flushMicrotasks();
    expect(screen.getByText("5")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    });
    await flushMicrotasks();

    expect(screen.queryByText("5")).not.toBeInTheDocument();
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it("(g5) badge reverts when markAllNotificationsRead throws", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockGetUnreadCount.mockResolvedValue(4);
    mockGetNotificationSummary.mockResolvedValue(defaultSummary);
    mockMarkAllNotificationsRead.mockRejectedValue(new Error("boom"));

    render(<NotificationBell />);
    await flushMicrotasks();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    });
    await flushMicrotasks();

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to mark all notifications as read:",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it("(g6) stale mark-read rejection does not clobber a later successful mark", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockGetUnreadCount.mockResolvedValue(5);
    mockGetNotificationSummary.mockResolvedValue(defaultSummary);

    // First open: slow mark-read that we'll reject *after* a second open succeeds.
    let rejectFirstMark: (reason: Error) => void = () => {};
    const firstMark = new Promise<never>((_, reject) => {
      rejectFirstMark = reject;
    });
    mockMarkAllNotificationsRead.mockReturnValueOnce(firstMark);
    // Second open: resolves synchronously with success.
    mockMarkAllNotificationsRead.mockResolvedValueOnce({ success: true });

    render(<NotificationBell />);
    await flushMicrotasks();

    const btn = screen.getByRole("button", { name: /notifications/i });
    // Open #1 (slow mark), close, open #2 (fast successful mark).
    await act(async () => {
      fireEvent.click(btn);
    });
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: "Escape",
      });
    });
    await act(async () => {
      fireEvent.click(btn);
    });
    await flushMicrotasks();

    expect(screen.queryByText("5")).not.toBeInTheDocument();

    // The stale first mark-read now rejects. It must not revert the badge.
    await act(async () => {
      rejectFirstMark(new Error("stale"));
    });
    await flushMicrotasks();

    expect(screen.queryByText("5")).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it("(g7) closing the popover before summary resolves skips mark-read", async () => {
    mockGetUnreadCount.mockResolvedValue(5);
    // Slow summary that only resolves after the user has already closed.
    let resolveSummary: (value: typeof defaultSummary) => void = () => {};
    const slowSummary = new Promise<typeof defaultSummary>((resolve) => {
      resolveSummary = resolve;
    });
    mockGetNotificationSummary.mockReturnValueOnce(slowSummary);

    render(<NotificationBell />);
    await flushMicrotasks();
    const btn = screen.getByRole("button", { name: /notifications/i });

    // Open → close before the summary fetch resolves.
    await act(async () => {
      fireEvent.click(btn);
    });
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: "Escape",
      });
    });

    // Only now does the slow fetch resolve. The mark-read step must NOT fire.
    await act(async () => {
      resolveSummary(defaultSummary);
    });
    await flushMicrotasks();

    expect(mockMarkAllNotificationsRead).not.toHaveBeenCalled();
    // Badge stays at the server-known count since we skipped the optimistic reset.
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("(g8) Retry after an initial fetch failure also runs mark-read", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockGetUnreadCount.mockResolvedValue(3);
    // First fetch fails, retry succeeds.
    mockGetNotificationSummary
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce(defaultSummary);

    render(<NotificationBell />);
    await flushMicrotasks();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    });
    await flushMicrotasks();

    // Initial fetch failed, no mark-read yet, badge intact.
    expect(mockMarkAllNotificationsRead).not.toHaveBeenCalled();
    expect(screen.getByText("3")).toBeInTheDocument();

    // Click Retry — must drive the same open-flow (fetch + mark-read).
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    });
    await flushMicrotasks();

    expect(mockGetNotificationSummary).toHaveBeenCalledTimes(2);
    expect(mockMarkAllNotificationsRead).toHaveBeenCalledOnce();
    expect(screen.queryByText("3")).not.toBeInTheDocument();
    consoleError.mockRestore();
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
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

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
      /^Notifications · Updated (just now|\d+[mhd] ago|\d+\/\d+\/\d+)$/,
    );
  });

  it("does not render a badge when the first fetch fails before any success", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mockGetUnreadCount.mockRejectedValueOnce(new Error("DB down"));
    render(<NotificationBell />);
    await flushMicrotasks();

    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("(j) ignores stale summary resolution after open → close → open race", async () => {
    mockGetUnreadCount.mockResolvedValue(0);

    // First open: slow-resolving fetch we control via a manual deferred.
    let resolveFirst: (value: typeof defaultSummary) => void = () => {};
    const firstSummary: typeof defaultSummary = {
      totalUnread: 1,
      groups: [
        {
          kind: "episodes_by_podcast",
          podcastId: 1,
          podcastTitle: "Stale Pod",
          count: 1,
        },
      ],
    };
    const firstFetch = new Promise<typeof defaultSummary>((resolve) => {
      resolveFirst = resolve;
    });
    mockGetNotificationSummary.mockReturnValueOnce(firstFetch);

    // Second open: resolves synchronously with fresh data.
    const freshSummary: typeof defaultSummary = {
      totalUnread: 2,
      groups: [
        {
          kind: "episodes_by_podcast",
          podcastId: 2,
          podcastTitle: "Fresh Pod",
          count: 2,
        },
      ],
    };
    mockGetNotificationSummary.mockResolvedValueOnce(freshSummary);

    render(<NotificationBell />);
    await flushMicrotasks();

    const btn = screen.getByRole("button", { name: /notifications/i });

    // Open (kicks off slow fetch), close, open again (kicks off fresh fetch).
    await act(async () => {
      fireEvent.click(btn);
    });
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: "Escape",
      });
    });
    await act(async () => {
      fireEvent.click(btn);
    });
    await flushMicrotasks();

    // The fresh fetch has resolved — popover now shows Fresh Pod.
    expect(
      screen.getByRole("link", { name: /from fresh pod/i }),
    ).toBeInTheDocument();

    // NOW the slow first fetch finally resolves. It must not clobber the fresh state.
    await act(async () => {
      resolveFirst(firstSummary);
    });
    await flushMicrotasks();

    expect(
      screen.getByRole("link", { name: /from fresh pod/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /from stale pod/i }),
    ).not.toBeInTheDocument();
  });
});
