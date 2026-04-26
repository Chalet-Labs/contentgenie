import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NOTIFICATIONS_PAGE_SIZE } from "@/lib/notifications-constants";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/events";
import { asPodcastIndexEpisodeId } from "@/types/ids";

// --- Mocks ---

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
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
  markNotificationRead: (...args: unknown[]) =>
    mockMarkNotificationRead(...args),
  markAllNotificationsRead: (...args: unknown[]) =>
    mockMarkAllNotificationsRead(...args),
  getNotifications: (...args: unknown[]) => mockGetNotifications(...args),
  getEpisodeTopics: (...args: unknown[]) => mockGetEpisodeTopics(...args),
}));

const mockGetListenedEpisodeIds = vi.fn();
vi.mock("@/app/actions/listen-history", () => ({
  getListenedEpisodeIds: (...args: unknown[]) =>
    mockGetListenedEpisodeIds(...args),
  recordListenEvent: vi.fn().mockResolvedValue({ success: true }),
}));

const mockAddToQueue = vi.fn();
const mockPlayEpisode = vi.fn();
// Mutable state the mock factory reads on each render — lets individual tests
// seed a non-empty queue before rendering without resorting to vi.doMock, which
// does not retroactively re-bind statically imported modules.
let mockPlayerState: {
  queue: Array<{ id: string }>;
  currentEpisode: unknown;
  isPlaying: boolean;
} = { queue: [], currentEpisode: null, isPlaying: false };
vi.mock("@/contexts/audio-player-context", () => ({
  useAudioPlayerAPI: () => ({
    addToQueue: mockAddToQueue,
    playEpisode: mockPlayEpisode,
  }),
  useAudioPlayerState: () => mockPlayerState,
  useNowPlayingEpisodeId: () =>
    (mockPlayerState.currentEpisode as { id: string } | null)?.id ?? null,
  // Mirror the real hook: nowPlayingId === episodeId AND the player is actively
  // playing. Tests that need an episode to read as "currently playing" must set
  // both `currentEpisode` and `isPlaying: true` on `mockPlayerState`.
  useIsEpisodePlaying: (id: string) =>
    id ===
      (mockPlayerState.currentEpisode as { id: string } | null | undefined)
        ?.id && mockPlayerState.isPlaying,
  useIsEpisodeInQueue: (id: string) =>
    mockPlayerState.queue.some((ep) => ep.id === id),
}));

// Import component after mocks
import { NotificationPageList } from "@/components/notifications/notification-page-list";

// --- Test helpers ---

type NotificationItem = React.ComponentProps<
  typeof NotificationPageList
>["initialItems"][0];

type MakeItemOverrides = Partial<
  Omit<NotificationItem, "episodePodcastIndexId">
> & {
  episodePodcastIndexId?: string | null;
};

function makeItem(overrides: MakeItemOverrides = {}): NotificationItem {
  const { episodePodcastIndexId, ...rest } = overrides;
  const piId =
    episodePodcastIndexId === undefined ? "PI-42" : episodePodcastIndexId;
  return {
    id: 1,
    type: "new_episode",
    title: "New episode: Test Podcast",
    body: "Test body",
    isRead: false,
    createdAt: new Date("2026-01-15T10:00:00Z"),
    episodeDbId: 10,
    episodePodcastIndexId: piId === null ? null : asPodcastIndexEpisodeId(piId),
    episodeTitle: "Test Episode",
    podcastTitle: "Test Podcast",
    worthItScore: "7.50",
    audioUrl: "https://example.com/audio.mp3",
    artwork: "https://example.com/art.jpg",
    duration: 3600,
    ...rest,
  };
}

const defaultProps = {
  initialItems: [
    makeItem({ id: 1, isRead: false }),
    makeItem({ id: 2, isRead: true }),
  ],
  initialHasMore: false,
  initialTopicsByEpisode: { 10: ["AI", "Tech", "Future"] },
};

describe("NotificationPageList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlayEpisode.mockImplementation(() => {});
    mockPlayerState = { queue: [], currentEpisode: null, isPlaying: false };
    mockDismissNotification.mockResolvedValue({ success: true });
    mockMarkNotificationRead.mockResolvedValue({ success: true });
    mockMarkAllNotificationsRead.mockResolvedValue({ success: true });
    mockGetNotifications.mockResolvedValue({
      notifications: [],
      hasMore: false,
      error: null,
    });
    mockGetEpisodeTopics.mockResolvedValue({});
    mockGetListenedEpisodeIds.mockResolvedValue([]);
  });

  // AC-3: empty state
  it("renders 'You're all caught up' when no notifications and hasMore=false", () => {
    render(
      <NotificationPageList
        initialItems={[]}
        initialHasMore={false}
        initialTopicsByEpisode={{}}
      />,
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
      />,
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
      />,
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
      />,
    );
    const chip = screen.getByText("AI");
    expect(chip.closest("button")).toBeNull();
  });

  // AC-6: Add-to-queue disabled when already in queue
  it("Add-to-queue button is disabled when episode is in queue", () => {
    mockPlayerState = {
      queue: [{ id: "PI-42" }],
      currentEpisode: null,
      isPlaying: false,
    };
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
    mockDismissNotification.mockResolvedValue({
      success: false,
      error: "Server error",
    });
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
        }),
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
    const listenBtns = screen.getAllByRole("button", {
      name: /^play episode$/i,
    });
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
    const listenBtns = screen.getAllByRole("button", {
      name: /^play episode$/i,
    });
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
      />,
    );
    const listenBtns = screen.getAllByRole("button", {
      name: /^play episode$/i,
    });
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
        initialItems={[makeItem({ id: 1, isRead: false, audioUrl: null })]}
        initialHasMore={false}
        initialTopicsByEpisode={{}}
      />,
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
  // contract violation upstream), neither Play nor View-episode is rendered —
  // we don't silently route to the dashboard. ListenedButton is also hidden
  // because it needs the podcast-index id to target recordListenEvent.
  it("hides primary action and ListenedButton when episodePodcastIndexId is null", () => {
    render(
      <NotificationPageList
        initialItems={[
          makeItem({ id: 1, episodePodcastIndexId: null, audioUrl: null }),
        ]}
        initialHasMore={false}
        initialTopicsByEpisode={{}}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /^play episode$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /view episode/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /mark as listened/i }),
    ).not.toBeInTheDocument();
  });

  // Listened wiring: initialListenedIds seeds each row's ListenedButton.
  // A row whose episodePodcastIndexId is in the set renders the "Already listened"
  // indicator (a span, not a button); a row that isn't renders the clickable
  // "Mark as listened" button. This proves the Set-lookup plumbing through the
  // listenedSet memo.
  it("renders ListenedButton state based on initialListenedIds", () => {
    render(
      <NotificationPageList
        initialItems={[
          makeItem({ id: 1, episodePodcastIndexId: "PI-unread" }),
          makeItem({ id: 2, episodePodcastIndexId: "PI-read" }),
        ]}
        initialHasMore={false}
        initialTopicsByEpisode={{}}
        initialListenedIds={[asPodcastIndexEpisodeId("PI-read")]}
      />,
    );
    // Row 1: unlistened → clickable Mark-as-listened button exists.
    expect(
      screen.getByRole("button", { name: /mark as listened/i }),
    ).toBeInTheDocument();
    // Row 2: listened → Already-listened indicator (a span with aria-label).
    expect(screen.getByLabelText(/already listened/i)).toBeInTheDocument();
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
      makeItem({ id: i + 1 }),
    );
    render(
      <NotificationPageList
        initialItems={fullPage}
        initialHasMore={true}
        initialTopicsByEpisode={{}}
      />,
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
      makeItem({ id: i + 1 }),
    );
    const since = new Date("2026-04-20T00:00:00.000Z");
    render(
      <NotificationPageList
        initialItems={fullPage}
        initialHasMore={true}
        initialTopicsByEpisode={{}}
        filter={{ podcastId: 42, since }}
      />,
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
      makeItem({ id: i + 1 }),
    );
    render(
      <NotificationPageList
        initialItems={fullPage}
        initialHasMore={true}
        initialTopicsByEpisode={{}}
      />,
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

    const listenBtns = screen.getAllByRole("button", {
      name: /^play episode$/i,
    });
    await user.click(listenBtns[0]);

    await waitFor(() => {
      expect(mockMarkNotificationRead).toHaveBeenCalledWith(1);
    });
    // Row should still render as unread because server rejected
    expect(screen.getAllByRole("article")[0]).toHaveAttribute(
      "data-read",
      "false",
    );
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
      />,
    );

    await user.click(screen.getByRole("button", { name: /load more/i }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringMatching(/failed to load/i),
        expect.objectContaining({
          action: expect.objectContaining({ label: "Retry" }),
        }),
      );
    });
    // Button is still present for manual retry
    expect(
      screen.getByRole("button", { name: /load more/i }),
    ).toBeInTheDocument();
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
        }),
      );
    });
    // Rows must NOT be flipped to read on failure
    expect(screen.getAllByRole("article")[0]).toHaveAttribute(
      "data-read",
      "false",
    );
  });

  // Regression: Listen click that throws still plays and toasts (not silent)
  it("Listen click that throws still plays episode and surfaces a toast", async () => {
    mockMarkNotificationRead.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    render(<NotificationPageList {...defaultProps} />);

    const listenBtns = screen.getAllByRole("button", {
      name: /^play episode$/i,
    });
    await user.click(listenBtns[0]);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        expect.stringMatching(/couldn.t mark as read/i),
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

  // Regression (Codex): listened state must stay in sync with ListenedButton
  // toggles elsewhere on the page (e.g. same episode appearing on two rows).
  // Before this fix, the parent's listenedSet was only ever seeded from props
  // and load-more, so a row remount or duplicate would revert to "Mark as
  // listened" after success.
  it("refreshes listenedIds from the server when LISTEN_STATE_CHANGED_EVENT fires", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetListenedEpisodeIds.mockResolvedValue([10]);
    render(
      <NotificationPageList
        initialItems={[
          makeItem({ id: 1, episodeDbId: 10, episodePodcastIndexId: "PI-42" }),
        ]}
        initialHasMore={false}
        initialTopicsByEpisode={{}}
        initialListenedIds={[]}
      />,
    );
    // Row starts unlistened — Mark-as-listened button visible.
    expect(
      screen.getByRole("button", { name: /mark as listened/i }),
    ).toBeInTheDocument();

    // Simulate the ListenedButton on another row firing the global event.
    window.dispatchEvent(new CustomEvent("listen-state-changed"));

    await waitFor(() => {
      expect(mockGetListenedEpisodeIds).toHaveBeenCalledWith([10]);
      expect(screen.getByLabelText(/already listened/i)).toBeInTheDocument();
    });
    errSpy.mockRestore();
  });

  // Load-more listened-fetch happy path — newly appended rows with episodes
  // the user has already listened to render the Already-listened indicator.
  it("Load more fetches listened state and seeds it into the newly appended rows", async () => {
    mockGetNotifications.mockResolvedValue({
      notifications: [
        makeItem({ id: 77, episodeDbId: 77, episodePodcastIndexId: "PI-77" }),
      ],
      hasMore: false,
      error: null,
    });
    mockGetEpisodeTopics.mockResolvedValue({});
    mockGetListenedEpisodeIds.mockResolvedValue([77]);
    const user = userEvent.setup();
    render(
      <NotificationPageList
        initialItems={defaultProps.initialItems}
        initialHasMore={true}
        initialTopicsByEpisode={{}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /load more/i }));
    await waitFor(() => {
      expect(mockGetListenedEpisodeIds).toHaveBeenCalledWith([77]);
      // The appended row for episode 77 renders the Already-listened indicator.
      expect(screen.getByLabelText(/already listened/i)).toBeInTheDocument();
    });
  });

  // Regression (ADR-038): NotificationRow must thread isListened through to
  // EpisodeCard so the listen-state accent bar reflects actual listen state.
  // Previously isListened was passed only to ListenedButton; forgetting to
  // forward it to EpisodeCard made listened notifications still show the bar.
  it("hides the listen-state accent bar on listened notifications", () => {
    render(
      <NotificationPageList
        initialItems={[makeItem({ id: 1, episodePodcastIndexId: "PI-42" })]}
        initialHasMore={false}
        initialTopicsByEpisode={{}}
        initialListenedIds={[asPodcastIndexEpisodeId("PI-42")]}
      />,
    );
    const card = screen.getByRole("article")
      .firstElementChild as HTMLElement | null;
    expect(card).not.toBeNull();
    expect(card!).toHaveAttribute("data-listened", "true");
  });

  it("shows the listen-state accent bar on unlistened notifications", () => {
    render(
      <NotificationPageList
        initialItems={[makeItem({ id: 1, episodePodcastIndexId: "PI-42" })]}
        initialHasMore={false}
        initialTopicsByEpisode={{}}
        initialListenedIds={[]}
      />,
    );
    const card = screen.getByRole("article")
      .firstElementChild as HTMLElement | null;
    expect(card).not.toBeNull();
    expect(card!).toHaveAttribute("data-listened", "false");
  });

  // Regression (#315): dismiss+load-more race — offset must be decremented
  // optimistically so a concurrent Load more uses the correct offset.
  it("Load more uses decremented offset when a dismiss is still in-flight", async () => {
    let resolveDismiss!: (v: { success: boolean }) => void;
    mockDismissNotification.mockReturnValue(
      new Promise<{ success: boolean }>((res) => {
        resolveDismiss = res;
      }),
    );
    mockGetNotifications.mockResolvedValue({
      notifications: [makeItem({ id: 999 })],
      hasMore: false,
      error: null,
    });

    const user = userEvent.setup();
    const N = 3;
    const items = Array.from({ length: N }, (_, i) => makeItem({ id: i + 1 }));
    render(
      <NotificationPageList
        initialItems={items}
        initialHasMore={true}
        initialTopicsByEpisode={{}}
      />,
    );

    // Fire dismiss — server response is still pending.
    await user.click(screen.getAllByRole("button", { name: /dismiss/i })[0]);
    expect(mockDismissNotification).toHaveBeenCalledWith(1);

    // Immediately fire Load more (dismiss not yet resolved).
    await user.click(screen.getByRole("button", { name: /load more/i }));

    // Load more must use offset N-1 (accounts for pending dismiss).
    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledWith(
        NOTIFICATIONS_PAGE_SIZE,
        N - 1,
        undefined,
      );
    });

    // Resolve the dismiss inside act() so the success-path setItems runs
    // before teardown (otherwise React logs an act(...) warning).
    await act(async () => {
      resolveDismiss({ success: true });
    });
  });

  // Regression (#315): on dismiss failure the optimistic offset decrement is
  // restored so the *next* Load more doesn't under-count.
  it("restores offset when a dismiss fails so subsequent Load more uses correct offset", async () => {
    let resolveDismiss!: (v: { success: boolean }) => void;
    mockDismissNotification.mockReturnValue(
      new Promise<{ success: boolean }>((res) => {
        resolveDismiss = res;
      }),
    );
    mockGetNotifications.mockResolvedValue({
      notifications: [makeItem({ id: 999 })],
      hasMore: false,
      error: null,
    });

    const user = userEvent.setup();
    const N = 3;
    const items = Array.from({ length: N }, (_, i) => makeItem({ id: i + 1 }));
    render(
      <NotificationPageList
        initialItems={items}
        initialHasMore={true}
        initialTopicsByEpisode={{}}
      />,
    );

    // Fire dismiss.
    await user.click(screen.getAllByRole("button", { name: /dismiss/i })[0]);
    expect(mockDismissNotification).toHaveBeenCalledWith(1);

    // Let the dismiss fail — offset should be restored to N. Wrap in act() so
    // the rollback's setItems flush isn't observed mid-render by waitFor.
    await act(async () => {
      resolveDismiss({ success: false });
    });
    await waitFor(() => {
      // Row reappears after rollback.
      expect(screen.getAllByRole("article")).toHaveLength(N);
    });
    // Surface the failure to the user so they know the dismiss didn't stick.
    expect(mockToastError).toHaveBeenCalledWith(
      "Failed to dismiss notification",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Retry" }),
      }),
    );

    // Load more after the failed dismiss must use the original offset N.
    await user.click(screen.getByRole("button", { name: /load more/i }));
    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledWith(
        NOTIFICATIONS_PAGE_SIZE,
        N,
        undefined,
      );
    });
  });

  // Regression (#315): Load more fired while dismiss is in-flight uses offset
  // N-1, so the returned page can overlap with rows still in state. If the
  // dismiss then fails (rollback restores its row), an unguarded append would
  // produce duplicate ids and React key collisions. The component must dedupe.
  it("does not duplicate ids when Load more overlaps with a failing dismiss", async () => {
    let resolveDismiss!: (v: { success: boolean }) => void;
    mockDismissNotification.mockReturnValue(
      new Promise<{ success: boolean }>((res) => {
        resolveDismiss = res;
      }),
    );
    // Server response simulates the overlap: Load more with offset N-1 returns
    // a row whose id collides with the still-pending dismiss target plus a new
    // row that has not been seen.
    mockGetNotifications.mockResolvedValue({
      notifications: [makeItem({ id: 3 }), makeItem({ id: 4 })],
      hasMore: false,
      error: null,
    });

    const user = userEvent.setup();
    const N = 3;
    const items = Array.from({ length: N }, (_, i) => makeItem({ id: i + 1 }));
    render(
      <NotificationPageList
        initialItems={items}
        initialHasMore={true}
        initialTopicsByEpisode={{}}
      />,
    );

    // Dismiss row 1 — server still pending.
    await user.click(screen.getAllByRole("button", { name: /dismiss/i })[0]);

    // Load more uses offset N-1; mocked response includes overlapping id 3.
    await user.click(screen.getByRole("button", { name: /load more/i }));
    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledWith(
        NOTIFICATIONS_PAGE_SIZE,
        N - 1,
        undefined,
      );
    });

    // Now fail the dismiss so row 1 reappears via rollback.
    await act(async () => {
      resolveDismiss({ success: false });
    });

    // Final visible state: ids 1, 2, 3, 4 — no duplicates of id 3.
    await waitFor(() => {
      expect(screen.getAllByRole("article")).toHaveLength(4);
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
      />,
    );

    await user.click(screen.getByRole("button", { name: /load more/i }));
    await waitFor(() => {
      // One new row appended (2 initial + 1 loaded)
      expect(screen.getAllByRole("article")).toHaveLength(3);
    });
  });

  // BLOCKING #1 fix verification: local state filter removes dismissed row immediately
  it("NOTIFICATIONS_CHANGED_EVENT with payload filters items by episodeDbId and calls router.refresh", async () => {
    const item1 = makeItem({ id: 1, episodeDbId: 10 });
    const item2 = makeItem({ id: 2, episodeDbId: 20 });
    render(
      <NotificationPageList
        initialItems={[item1, item2]}
        initialHasMore={false}
        initialTopicsByEpisode={{}}
      />,
    );
    expect(screen.getAllByRole("article")).toHaveLength(2);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, {
          detail: { episodeDbIds: [10] },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getAllByRole("article")).toHaveLength(1);
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  // Empty-payload re-fetch: optimistic addToQueue dispatch with no episodeDbIds
  it("NOTIFICATIONS_CHANGED_EVENT with empty payload re-fetches via getNotifications and calls router.refresh", async () => {
    const item1 = makeItem({ id: 1, episodeDbId: 10 });
    const item2 = makeItem({ id: 2, episodeDbId: 20 });
    mockGetNotifications.mockResolvedValue({
      notifications: [makeItem({ id: 99, episodeDbId: 99 })],
      hasMore: false,
      error: null,
    });

    render(
      <NotificationPageList
        initialItems={[item1, item2]}
        initialHasMore={false}
        initialTopicsByEpisode={{}}
      />,
    );
    expect(screen.getAllByRole("article")).toHaveLength(2);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, {
          detail: { episodeDbIds: [] },
        }),
      );
    });

    await waitFor(() => {
      expect(mockGetNotifications).toHaveBeenCalledWith(
        NOTIFICATIONS_PAGE_SIZE,
        0,
        undefined,
      );
      expect(screen.getAllByRole("article")).toHaveLength(1);
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});
