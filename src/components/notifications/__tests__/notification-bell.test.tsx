import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

const mockGetUnreadCount = vi.fn();
vi.mock("@/app/actions/notifications", () => ({
  getUnreadCount: (...args: unknown[]) => mockGetUnreadCount(...args),
}));

// Import after mocks
import { NotificationBell } from "@/components/notifications/notification-bell";

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetUnreadCount.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function flushMicrotasks() {
    // Allow pending promise resolutions to settle inside act().
    await act(async () => {
      await Promise.resolve();
    });
  }

  it("renders without a badge before the first fetch resolves", () => {
    mockGetUnreadCount.mockReturnValue(new Promise(() => {}));
    render(<NotificationBell />);

    expect(screen.getByRole("link", { name: /notifications/i })).toBeInTheDocument();
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it("renders the badge count after a successful fetch", async () => {
    mockGetUnreadCount.mockResolvedValue(3);
    render(<NotificationBell />);

    await flushMicrotasks();

    expect(screen.getByText("3")).toBeInTheDocument();
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

  it("links to /notifications", () => {
    mockGetUnreadCount.mockReturnValue(new Promise(() => {}));
    render(<NotificationBell />);

    expect(screen.getByRole("link", { name: /notifications/i })).toHaveAttribute(
      "href",
      "/notifications"
    );
  });

  it("preserves the last known count when a subsequent poll throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    mockGetUnreadCount.mockResolvedValueOnce(5);
    render(<NotificationBell />);
    await flushMicrotasks();
    expect(screen.getByText("5")).toBeInTheDocument();

    // Poll tick — this call rejects; the badge must NOT flip to 0.
    mockGetUnreadCount.mockRejectedValueOnce(new Error("DB down"));
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await flushMicrotasks();

    expect(screen.getByText("5")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("polls on the configured interval and updates the badge", async () => {
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

  it("does not render a badge when the first fetch fails before any success", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    mockGetUnreadCount.mockRejectedValueOnce(new Error("DB down"));
    render(<NotificationBell />);
    await flushMicrotasks();

    // Count is unknown — no badge shown, no false "0".
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
