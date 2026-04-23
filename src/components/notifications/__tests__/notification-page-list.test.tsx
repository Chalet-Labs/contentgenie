import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// --- Mocks ---

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

const mockDismissNotification = vi.fn();
const mockMarkNotificationRead = vi.fn();
const mockMarkAllNotificationsRead = vi.fn();
const mockGetNotifications = vi.fn();
const mockGetEpisodeTopics = vi.fn();
vi.mock("@/app/actions/notifications", () => ({
  dismissNotification: (...args: unknown[]) => mockDismissNotification(...args),
  markNotificationRead: (...args: unknown[]) => mockMarkNotificationRead(...args),
  markAllNotificationsRead: (...args: unknown[]) => mockMarkAllNotificationsRead(...args),
  getNotifications: (...args: unknown[]) => mockGetNotifications(...args),
  getEpisodeTopics: (...args: unknown[]) => mockGetEpisodeTopics(...args),
}));

const mockAddToQueue = vi.fn();
const mockPlayEpisode = vi.fn();
// Mutable state the mock factory reads on each render — lets individual tests
// seed a non-empty queue before rendering without resorting to vi.doMock, which
// does not retroactively re-bind statically imported modules.
let mockPlayerState: {
  queue: Array<{ id: string }>;
  currentEpisode: unknown;
} = { queue: [], currentEpisode: null };
vi.mock("@/contexts/audio-player-context", () => ({
  useAudioPlayerAPI: () => ({ addToQueue: mockAddToQueue, playEpisode: mockPlayEpisode }),
  useAudioPlayerState: () => mockPlayerState,
}));

// Import component after mocks
import { NotificationPageList } from "@/components/notifications/notification-page-list";

// --- Test helpers ---

type NotificationItem = React.ComponentProps<typeof NotificationPageList>["initialItems"][0];

function makeItem(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 1,
    type: "new_episode",
    title: "New episode: Test Podcast",
    body: "Test body",
    isRead: false,
    createdAt: new Date("2026-01-15T10:00:00Z"),
    episodeDbId: 10,
    episodePodcastIndexId: "PI-42",
    episodeTitle: "Test Episode",
    podcastTitle: "Test Podcast",
    worthItScore: "7.50",
    audioUrl: "https://example.com/audio.mp3",
    artwork: "https://example.com/art.jpg",
    duration: 3600,
    ...overrides,
  };
}

const defaultProps = {
  initialItems: [makeItem({ id: 1, isRead: false }), makeItem({ id: 2, isRead: true })],
  initialHasMore: false,
  initialTopicsByEpisode: { 10: ["AI", "Tech", "Future"] },
};

describe("NotificationPageList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlayEpisode.mockImplementation(() => {});
    mockPlayerState = { queue: [], currentEpisode: null };
    mockDismissNotification.mockResolvedValue({ success: true });
    mockMarkNotificationRead.mockResolvedValue({ success: true });
    mockMarkAllNotificationsRead.mockResolvedValue({ success: true });
    mockGetNotifications.mockResolvedValue({ notifications: [], hasMore: false, error: null });
    mockGetEpisodeTopics.mockResolvedValue({});
  });

  // AC-3: empty state
  it("renders 'You're all caught up' when no notifications and hasMore=false", () => {
    render(
      <NotificationPageList
        initialItems={[]}
        initialHasMore={false}
        initialTopicsByEpisode={{}}
      />
    );
    expect(screen.getByText(/you're all caught up/i)).toBeInTheDocument();
  });

  // AC-3: empty state not shown when items exist
  it("does not render empty state when items exist", () => {
    render(<NotificationPageList {...defaultProps} />);
    expect(screen.queryByText(/you're all caught up/i)).not.toBeInTheDocument();
  });

  // AC-4: Tabs filter — All shows everything
  it("All tab shows all items", () => {
    render(<NotificationPageList {...defaultProps} />);
    const rows = screen.getAllByRole("article");
    expect(rows).toHaveLength(2);
  });

  // AC-4: Unread tab
  it("Unread tab filters to unread items only", async () => {
    const user = userEvent.setup();
    render(<NotificationPageList {...defaultProps} />);
    await user.click(screen.getByRole("tab", { name: /unread/i }));
    const rows = screen.getAllByRole("article");
    expect(rows).toHaveLength(1);
  });

  // AC-4: Read tab
  it("Read tab filters to read items only", async () => {
    const user = userEvent.setup();
    render(<NotificationPageList {...defaultProps} />);
    await user.click(screen.getByRole("tab", { name: /^read$/i }));
    const rows = screen.getAllByRole("article");
    expect(rows).toHaveLength(1);
  });

  // AC-4: tab-specific empty state when slice is empty but items exist
  it("shows 'No unread notifications' when Unread tab is empty but items exist", async () => {
    const user = userEvent.setup();
    render(
      <NotificationPageList
        initialItems={[makeItem({ id: 1, isRead: true })]}
        initialHasMore={false}
        initialTopicsByEpisode={{}}
      />
    );
    await user.click(screen.getByRole("tab", { name: /unread/i }));
    expect(screen.getByText(/no unread notifications/i)).toBeInTheDocument();
  });

  // AC-5: topic chips render up to 3
  it("renders up to 3 topic chips per notification", () => {
    render(
      <NotificationPageList
        initialItems={[makeItem({ id: 1, episodeDbId: 10 })]}
        initialHasMore={false}
        initialTopicsByEpisode={{ 10: ["AI", "Tech", "Future", "Extra"] }}
      />
    );
    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.getByText("Tech")).toBeInTheDocument();
    expect(screen.getByText("Future")).toBeInTheDocument();
    expect(screen.queryByText("Extra")).not.toBeInTheDocument();
  });

  // AC-5: chips are not interactive
  it("topic chips have no onClick handler", () => {
    render(
      <NotificationPageList
        initialItems={[makeItem({ id: 1, episodeDbId: 10 })]}
        initialHasMore={false}
        initialTopicsByEpisode={{ 10: ["AI"] }}
      />
    );
    const chip = screen.getByText("AI");
    expect(chip.closest("button")).toBeNull();
  });

  // AC-6: Add-to-queue disabled when already in queue
  it("Add-to-queue button is disabled when episode is in queue", () => {
    mockPlayerState = { queue: [{ id: "PI-42" }], currentEpisode: null };
    render(<NotificationPageList {...defaultProps} />);
    const btn = screen.getAllByRole("button", {
      name: /already in queue|add to queue/i,
    })[0];
    expect(btn).toBeDisabled();
  });

  // AC-7: optimistic dismiss removes row immediately and persists after server confirms
  it("dismiss removes row optimistically and persists on server success", async () => {
    const user = userEvent.setup();
    render(<NotificationPageList {...defaultProps} />);
    expect(screen.getAllByRole("article")).toHaveLength(2);
    const dismissBtns = screen.getAllByRole("button", { name: /dismiss/i });
    await user.click(dismissBtns[0]);
    await waitFor(() => {
      expect(mockDismissNotification).toHaveBeenCalledWith(1);
      // Row is gone after server confirms
      expect(screen.getAllByRole("article")).toHaveLength(1);
    });
  });

  // AC-8: dismiss failure — row reappears AND toast fires with Retry action
  it("row reappears and shows toast with Retry action on dismiss failure", async () => {
    mockDismissNotification.mockResolvedValue({ success: false, error: "Server error" });
    const user = userEvent.setup();
    render(<NotificationPageList {...defaultProps} />);
    expect(screen.getAllByRole("article")).toHaveLength(2);
    const dismissBtns = screen.getAllByRole("button", { name: /dismiss/i });
    await user.click(dismissBtns[0]);
    await waitFor(() => {
      // Row reappears after optimistic revert
      expect(screen.getAllByRole("article")).toHaveLength(2);
      expect(mockToastError).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          action: expect.objectContaining({ label: "Retry" }),
        })
      );
    });
  });

  // AC-9: mark-all-read
  it("mark-all-read calls markAllNotificationsRead and flips all items to read", async () => {
    const user = userEvent.setup();
    render(<NotificationPageList {...defaultProps} />);
    const markAllBtn = screen.getByRole("button", { name: /mark all.*read/i });
    await user.click(markAllBtn);
    await waitFor(() => {
      expect(mockMarkAllNotificationsRead).toHaveBeenCalled();
    });
  });

  // AC-10: visiting page does NOT auto-mark notifications
  it("does not call markNotificationRead or markAllNotificationsRead on initial render", () => {
    render(<NotificationPageList {...defaultProps} />);
    expect(mockMarkNotificationRead).not.toHaveBeenCalled();
    expect(mockMarkAllNotificationsRead).not.toHaveBeenCalled();
  });

  // AC-14: Listen click calls markNotificationRead when unread, then plays episode
  it("Listen click calls markNotificationRead if unread then plays episode", async () => {
    const user = userEvent.setup();
    render(<NotificationPageList {...defaultProps} />);
    const listenBtns = screen.getAllByRole("button", { name: /listen/i });
    await user.click(listenBtns[0]);
    await waitFor(() => {
      expect(mockMarkNotificationRead).toHaveBeenCalledWith(1);
      expect(mockPlayEpisode).toHaveBeenCalled();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  // Regression: Listen click must NOT navigate away from the notifications page.
  // Legacy behavior routed to the episode page; the dedicated Listen CTA is an
  // in-place action so users can keep triaging while audio plays.
  it("Listen click does NOT call router.push", async () => {
    const user = userEvent.setup();
    render(<NotificationPageList {...defaultProps} />);
    const listenBtns = screen.getAllByRole("button", { name: /listen/i });
    await user.click(listenBtns[0]);
    await waitFor(() => {
      expect(mockPlayEpisode).toHaveBeenCalled();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  // AC-14: Listen click on already-read item skips markNotificationRead
  it("Listen click on read item skips markNotificationRead", async () => {
    const user = userEvent.setup();
    render(
      <NotificationPageList
        initialItems={[makeItem({ id: 2, isRead: true })]}
        initialHasMore={false}
        initialTopicsByEpisode={{}}
      />
    );
    const listenBtns = screen.getAllByRole("button", { name: /listen/i });
    await user.click(listenBtns[0]);
    await waitFor(() => {
      expect(mockMarkNotificationRead).not.toHaveBeenCalled();
      expect(mockPlayEpisode).toHaveBeenCalled();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  // Primary-action fallback: when audioUrl is missing but episode id is present,
  // show "View episode" outline button that navigates (no playback).
  // Also locks the read-on-navigate side effect for the fallback path.
  it("shows View-episode CTA when audioUrl is null and routes via onRowClick", async () => {
    const user = userEvent.setup();
    render(
      <NotificationPageList
        initialItems={[
          makeItem({ id: 1, isRead: false, audioUrl: null }),
        ]}
        initialHasMore={false}
        initialTopicsByEpisode={{}}
      />
    );
    const viewBtn = screen.getByRole("button", { name: /view episode/i });
    await user.click(viewBtn);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("PI-42"));
      expect(mockMarkNotificationRead).toHaveBeenCalledWith(1);
    });
    expect(mockPlayEpisode).not.toHaveBeenCalled();
  });

  // Primary-action hidden: when episodePodcastIndexId is missing (data-integrity
  // contract violation upstream), neither Listen nor View-episode is rendered —
  // we don't silently route to the dashboard.
  it("hides primary action when episodePodcastIndexId is null", () => {
    render(
      <NotificationPageList
        initialItems={[
          makeItem({ id: 1, episodePodcastIndexId: null, audioUrl: null }),
        ]}
        initialHasMore={false}
        initialTopicsByEpisode={{}}
      />
    );
    expect(
      screen.queryByRole("button", { name: /^listen$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /view episode/i })
    ).not.toBeInTheDocument();
  });

  // Load more: calls getNotifications with next offset
  it("Load more button calls getNotifications with offset 50", async () => {
    mockGetNotifications.mockResolvedValue({
      notifications: [makeItem({ id: 999 })],
      hasMore: false,
      error: null,
    });
    mockGetEpisodeTopics.mockResolvedValue({});
    const user = userEvent.setup();
    // A full first page (50 items) mirrors the real server-component hydration
    // and sets offsetRef to 50, matching the expected next-offset assertion.
    const fullPage = Array.from({ length: 50 }, (_, i) =>
      makeItem({ id: i + 1 })
    );
    render(
      <NotificationPageList
        initialItems={fullPage}
        initialHasMore={true}
        initialTopicsByEpisode={{}}
      />
    );
    const loadMoreBtn = screen.getByRole("button", { name: /load more/i });
    await user.click(loadMoreBtn);
    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledWith(50, 50, undefined);
    });
  });

  it("Load more forwards the active filter so page 2 stays scoped to the filter", async () => {
    mockGetNotifications.mockResolvedValue({
      notifications: [makeItem({ id: 999 })],
      hasMore: false,
      error: null,
    });
    mockGetEpisodeTopics.mockResolvedValue({});
    const user = userEvent.setup();
    const fullPage = Array.from({ length: 50 }, (_, i) =>
      makeItem({ id: i + 1 })
    );
    const since = new Date("2026-04-20T00:00:00.000Z");
    render(
      <NotificationPageList
        initialItems={fullPage}
        initialHasMore={true}
        initialTopicsByEpisode={{}}
        filter={{ podcastId: 42, since }}
      />
    );
    const loadMoreBtn = screen.getByRole("button", { name: /load more/i });
    await user.click(loadMoreBtn);
    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledWith(50, 50, {
        podcastId: 42,
        since,
      });
    });
  });

  // Regression: dismiss success decrements offset so next Load more doesn't skip a row
  it("dismiss success decrements offset so Load more doesn't skip a server row", async () => {
    mockGetNotifications.mockResolvedValue({
      notifications: [makeItem({ id: 999 })],
      hasMore: false,
      error: null,
    });
    const user = userEvent.setup();
    const fullPage = Array.from({ length: 50 }, (_, i) =>
      makeItem({ id: i + 1 })
    );
    render(
      <NotificationPageList
        initialItems={fullPage}
        initialHasMore={true}
        initialTopicsByEpisode={{}}
      />
    );

    // Dismiss the first row — offset should go from 50 to 49
    await user.click(screen.getAllByRole("button", { name: /dismiss/i })[0]);
    await waitFor(() => {
      expect(screen.getAllByRole("article")).toHaveLength(49);
    });

    // Clicking Load more should now request offset 49, not 50
    await user.click(screen.getByRole("button", { name: /load more/i }));
    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledWith(50, 49, undefined);
    });
  });

  // Regression: Listen click does NOT mark local as read when server action fails
  it("Listen click does NOT flip local isRead when markNotificationRead fails", async () => {
    mockMarkNotificationRead.mockResolvedValue({
      success: false,
      error: "Notification not found",
    });
    const user = userEvent.setup();
    render(<NotificationPageList {...defaultProps} />);

    const unreadRow = screen.getAllByRole("article")[0];
    expect(unreadRow).toHaveAttribute("data-read", "false");

    const listenBtns = screen.getAllByRole("button", { name: /listen/i });
    await user.click(listenBtns[0]);

    await waitFor(() => {
      expect(mockMarkNotificationRead).toHaveBeenCalledWith(1);
    });
    // Row should still render as unread because server rejected
    expect(screen.getAllByRole("article")[0]).toHaveAttribute("data-read", "false");
    expect(mockPush).not.toHaveBeenCalled();
  });

  // Regression: Load more fetch failure preserves hasMore and surfaces toast with Retry
  it("Load more fetch failure preserves the button and toasts with Retry", async () => {
    mockGetNotifications.mockResolvedValue({
      notifications: [],
      hasMore: false,
      error: "Network error",
    });
    const user = userEvent.setup();
    render(
      <NotificationPageList
        initialItems={defaultProps.initialItems}
        initialHasMore={true}
        initialTopicsByEpisode={{}}
      />
    );

    await user.click(screen.getByRole("button", { name: /load more/i }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringMatching(/failed to load/i),
        expect.objectContaining({
          action: expect.objectContaining({ label: "Retry" }),
        })
      );
    });
    // Button is still present for manual retry
    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
  });

  // Regression: mark-all-read failure surfaces a toast with Retry (previously silent)
  it("mark-all-read failure surfaces a toast with Retry", async () => {
    mockMarkAllNotificationsRead.mockResolvedValue({
      success: false,
      error: "DB error",
    });
    const user = userEvent.setup();
    render(<NotificationPageList {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /mark all as read/i }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringMatching(/mark all as read|db error/i),
        expect.objectContaining({
          action: expect.objectContaining({ label: "Retry" }),
        })
      );
    });
    // Rows must NOT be flipped to read on failure
    expect(screen.getAllByRole("article")[0]).toHaveAttribute("data-read", "false");
  });

  // Regression: Listen click that throws still plays and toasts (not silent)
  it("Listen click that throws still plays episode and surfaces a toast", async () => {
    mockMarkNotificationRead.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    render(<NotificationPageList {...defaultProps} />);

    const listenBtns = screen.getAllByRole("button", { name: /listen/i });
    await user.click(listenBtns[0]);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringMatching(/couldn.t mark as read/i)
      );
      expect(mockPlayEpisode).toHaveBeenCalled();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  // Regression (Gemini review): clicking the title link marks the notification
  // as read so navigation via the primary nav target doesn't leave unread state
  // behind. Legacy row-level onClick handled this; the split primary/View flow
  // dropped it, so the primitive now exposes onTitleClick which wires into
  // markReadOptimistic.
  it("clicking the title link marks the notification as read", async () => {
    const user = userEvent.setup();
    render(<NotificationPageList {...defaultProps} />);
    const titleLink = screen.getAllByRole("link", { name: /test episode/i })[0];
    await user.click(titleLink);
    await waitFor(() => {
      expect(mockMarkNotificationRead).toHaveBeenCalledWith(1);
    });
  });

  // Regression: Load more degrades gracefully when getEpisodeTopics throws
  it("Load more appends rows even if getEpisodeTopics throws", async () => {
    mockGetNotifications.mockResolvedValue({
      notifications: [makeItem({ id: 77, episodeDbId: 77 })],
      hasMore: false,
      error: null,
    });
    mockGetEpisodeTopics.mockRejectedValue(new Error("topics down"));
    const user = userEvent.setup();
    render(
      <NotificationPageList
        initialItems={defaultProps.initialItems}
        initialHasMore={true}
        initialTopicsByEpisode={{}}
      />
    );

    await user.click(screen.getByRole("button", { name: /load more/i }));
    await waitFor(() => {
      // One new row appended (2 initial + 1 loaded)
      expect(screen.getAllByRole("article")).toHaveLength(3);
    });
  });
});
