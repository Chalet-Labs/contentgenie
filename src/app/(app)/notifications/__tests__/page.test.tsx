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

    render((await NotificationsPage()) as React.ReactElement);

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

    render((await NotificationsPage()) as React.ReactElement);

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

    render((await NotificationsPage()) as React.ReactElement);

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

    render((await NotificationsPage()) as React.ReactElement);

    expect(screen.getByTestId("notification-page-list")).toHaveTextContent(
      "items:0:hasMore:false:topics:0"
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
