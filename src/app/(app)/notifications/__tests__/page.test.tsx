import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

const mockGetNotifications = vi.fn();
const mockGetEpisodeTopics = vi.fn();
vi.mock("@/app/actions/notifications", () => ({
  getNotifications: (...args: unknown[]) => mockGetNotifications(...args),
  getEpisodeTopics: (...args: unknown[]) => mockGetEpisodeTopics(...args),
}));

vi.mock("@/components/notifications/notification-page-list", () => ({
  NotificationPageList: ({
    initialItems,
    initialHasMore,
    initialTopicsByEpisode,
  }: {
    initialItems: Array<{ id: number }>;
    initialHasMore: boolean;
    initialTopicsByEpisode: Record<number, string[]>;
  }) => (
    <div data-testid="notification-page-list">
      items:{initialItems.length}:hasMore:{String(initialHasMore)}:topics:
      {Object.keys(initialTopicsByEpisode).length}
    </div>
  ),
}));

import NotificationsPage from "@/app/(app)/notifications/page";

describe("NotificationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
  });

  function mockSuccess(items: Array<{ id: number; episodeDbId?: number | null }> = []) {
    mockGetNotifications.mockResolvedValue({
      notifications: items,
      hasMore: false,
      error: null,
    });
    mockGetEpisodeTopics.mockResolvedValue({});
  }

  it("renders the list with initial items on success", async () => {
    mockGetNotifications.mockResolvedValue({
      notifications: [
        { id: 1, episodeDbId: 10 },
        { id: 2, episodeDbId: null },
      ],
      hasMore: true,
      error: null,
    });
    mockGetEpisodeTopics.mockResolvedValue({ 10: ["AI", "Tech"] });

    render(
      (await NotificationsPage({ searchParams: Promise.resolve({}) })) as React.ReactElement
    );

    expect(screen.getByTestId("notification-page-list")).toHaveTextContent(
      "items:2:hasMore:true:topics:1"
    );
    expect(mockGetEpisodeTopics).toHaveBeenCalledWith([10]);
  });

  it("skips getEpisodeTopics when no notifications have an episode id", async () => {
    mockGetNotifications.mockResolvedValue({
      notifications: [{ id: 1, episodeDbId: null }],
      hasMore: false,
      error: null,
    });

    render(
      (await NotificationsPage({ searchParams: Promise.resolve({}) })) as React.ReactElement
    );

    expect(mockGetEpisodeTopics).not.toHaveBeenCalled();
    expect(screen.getByTestId("notification-page-list")).toHaveTextContent(
      "items:1:hasMore:false:topics:0"
    );
  });

  it("renders an error state (not the empty state) when getNotifications returns an error", async () => {
    mockGetNotifications.mockResolvedValue({
      notifications: [],
      hasMore: false,
      error: "Failed to load notifications",
    });

    render(
      (await NotificationsPage({ searchParams: Promise.resolve({}) })) as React.ReactElement
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/couldn't load notifications/i)).toBeInTheDocument();
    expect(screen.queryByTestId("notification-page-list")).not.toBeInTheDocument();
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument();
    expect(mockGetEpisodeTopics).not.toHaveBeenCalled();
  });

  it("still renders the list (empty) on success with zero notifications — distinguishes from error", async () => {
    mockGetNotifications.mockResolvedValue({
      notifications: [],
      hasMore: false,
      error: null,
    });

    render(
      (await NotificationsPage({ searchParams: Promise.resolve({}) })) as React.ReactElement
    );

    expect(screen.getByTestId("notification-page-list")).toHaveTextContent(
      "items:0:hasMore:false:topics:0"
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("(a) no search params: getNotifications called with (50, 0, undefined)", async () => {
    mockSuccess();
    await NotificationsPage({ searchParams: Promise.resolve({}) });
    expect(mockGetNotifications).toHaveBeenCalledWith(50, 0, undefined);
  });

  it("(b) ?podcast=42: getNotifications called with podcastId filter", async () => {
    mockSuccess();
    await NotificationsPage({ searchParams: Promise.resolve({ podcast: "42" }) });
    expect(mockGetNotifications).toHaveBeenCalledWith(50, 0, { podcastId: 42 });
  });

  it("(c) ?podcast=abc (invalid): getNotifications called without filter", async () => {
    mockSuccess();
    await NotificationsPage({ searchParams: Promise.resolve({ podcast: "abc" }) });
    expect(mockGetNotifications).toHaveBeenCalledWith(50, 0, undefined);
  });

  it("(d) ?since=2026-04-20T00:00:00Z: getNotifications called with since filter", async () => {
    mockSuccess();
    await NotificationsPage({
      searchParams: Promise.resolve({ since: "2026-04-20T00:00:00.000Z" }),
    });
    expect(mockGetNotifications).toHaveBeenCalledWith(50, 0, {
      since: new Date("2026-04-20T00:00:00.000Z"),
    });
  });

  it("(e) ?since=not-a-date: getNotifications called without filter", async () => {
    mockSuccess();
    await NotificationsPage({ searchParams: Promise.resolve({ since: "not-a-date" }) });
    expect(mockGetNotifications).toHaveBeenCalledWith(50, 0, undefined);
  });

  it("(f) combined ?podcast=42&since=2026-04-20: getNotifications called with both filters", async () => {
    mockSuccess();
    await NotificationsPage({
      searchParams: Promise.resolve({
        podcast: "42",
        since: "2026-04-20T00:00:00.000Z",
      }),
    });
    expect(mockGetNotifications).toHaveBeenCalledWith(50, 0, {
      podcastId: 42,
      since: new Date("2026-04-20T00:00:00.000Z"),
    });
  });
});
